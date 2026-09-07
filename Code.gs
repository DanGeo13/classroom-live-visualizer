/**
 * Classroom Live Visualizer - Backend API (v7 Enhanced)
 * Deploy as a Web App:
 *   - Execute as: Me (your Google account)
 *   - Who has access: Anyone
 *
 * Requirements:
 * 1. Script Properties: GEMINI_API_KEY (from Google AI Studio)
 * 2. Deploy -> Manage Deployments -> New Version every time you update this code.
 */

const FOLDER_NAME = "Classroom Demonstrations";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const STATE_SHEET_NAME = "Live_Classification_State";
const STATE_SPREADSHEET_NAME = "Classroom Live Visualizer - State";

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok", message: "Classroom Live Visualizer API is active and running." })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let responseObj;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No POST payload received.");
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === "saveDemonstrationPackage") {
      responseObj = saveDemonstrationPackage(
        payload.base64Video,
        payload.transcriptLog,
        payload.meta,
        payload.sessionTitle,
        payload.thumbnailBase64
      );
    } else if (action === "classifyTranscript") {
      responseObj = classifyWithGemini_(payload.lines, payload.domain);
    } else if (action === "resetSessionState") {
      responseObj = resetStateSheet_();
    } else {
      responseObj = { success: false, message: "Unknown API action: " + action };
    }
  } catch (err) {
    responseObj = { success: false, message: "Server error: " + err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(responseObj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// 1. STATE SPREADSHEET (Persistent memory across batch intervals)
// ============================================================================

function getStateSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('STATE_SPREADSHEET_ID');
  let ss = null;

  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(STATE_SPREADSHEET_NAME);
    props.setProperty('STATE_SPREADSHEET_ID', ss.getId());
  }
  return ss;
}

function getOrCreateStateSheet_() {
  const ss = getStateSpreadsheet_();
  let sheet = ss.getSheetByName(STATE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATE_SHEET_NAME);
    sheet.appendRow(["Category", "Item"]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 130);
    sheet.setColumnWidth(2, 450);
  }
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }
  return sheet;
}

function readStateFromSheet_() {
  const sheet = getOrCreateStateSheet_();
  const lastRow = sheet.getLastRow();
  const state = { tools: [], ingredients: [], techniques: [] };
  if (lastRow < 2) return state;

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  data.forEach(function(row) {
    const category = String(row[0]).toLowerCase().trim();
    const item = String(row[1]).trim();
    if (!item) return;
    if (category === 'tool') state.tools.push(item);
    else if (category === 'ingredient') state.ingredients.push(item);
    else if (category === 'technique') state.techniques.push(item);
  });
  return state;
}

function writeStateToSheet_(state) {
  const sheet = getOrCreateStateSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  }

  const rows = [];
  (state.tools || []).forEach(function(t) { if (t && t.trim()) rows.push(["tool", t.trim()]); });
  (state.ingredients || []).forEach(function(i) { if (i && i.trim()) rows.push(["ingredient", i.trim()]); });
  (state.techniques || []).forEach(function(t) { if (t && t.trim()) rows.push(["technique", t.trim()]); });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
}

function resetStateSheet_() {
  const sheet = getOrCreateStateSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  }
  return { success: true, message: "Live demonstration state reset successfully." };
}

// ============================================================================
// 2. GEMINI CLASSIFICATION & CONTINUOUS EXTRACTION
// ============================================================================

function classifyWithGemini_(lines, domain) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { success: false, message: "GEMINI_API_KEY is not configured in Script Properties." };
    }

    const state = readStateFromSheet_();

    // If no new lines passed, hydrate existing state
    if (!lines || lines.length === 0) {
      return { success: true, tools: state.tools, ingredients: state.ingredients, techniques: state.techniques };
    }

    const transcriptText = lines.map(function(l) {
      return `[${l.time}] ${l.text}`;
    }).join('\n');

    const domainLabel = domain || "general practical demonstration";

    const systemPrompt =
      "You are an instructional assistant tracking materials, tools, and safety techniques in real time during a school demonstration for: " + domainLabel + ".\n" +
      "Maintain and update the existing list based on the new spoken lines.\n\n" +
      "RULES:\n" +
      "1. ATTRIBUTE MEASUREMENTS: Never output bare numbers/units alone (e.g. NEVER output '500g', '200mm'). Combine with the noun ('500 grams of plain flour', '1200mm dressed pine').\n" +
      "2. ATTRIBUTE PREPARATION: Attach prep descriptors to ingredients ('2 roughly diced onions', 'sifted flour').\n" +
      "3. REFINE/REPLACE: If a speaker adjusts or repeats an item ('actually 500g, not 300g'), update the single existing entry completely. Do not duplicate items.\n" +
      "4. CANCELLATION: If an item is canceled or ruled out ('don't use the whisk', 'scratch the pine'), remove it from the list.\n" +
      "5. TECHNIQUES: Reserve for methods, safety, or physical posture cues ('claw grip on the tomato', 'hold chisel bevel down at 30 degrees').\n" +
      "6. RETURN ONLY RAW JSON matching the structure: {\"tools\":[], \"ingredients\":[], \"techniques\":[]}.";

    const userMessage =
      "CURRENT STATE:\n" +
      "Tools: " + JSON.stringify(state.tools) + "\n" +
      "Ingredients/Materials: " + JSON.stringify(state.ingredients) + "\n" +
      "Techniques/Safety: " + JSON.stringify(state.techniques) + "\n\n" +
      "NEW SPOKEN TRANSCRIPT:\n" + transcriptText;

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey;
    const requestPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(requestPayload),
      muteHttpExceptions: true
    });

    const status = resp.getResponseCode();
    const bodyText = resp.getContentText();

    if (status !== 200) {
      return { success: false, message: "Gemini API error (" + status + "): " + bodyText.substring(0, 180) };
    }

    const body = JSON.parse(bodyText);
    if (!body.candidates || !body.candidates[0] || !body.candidates[0].content) {
      return { success: false, message: "Invalid candidate returned from Gemini." };
    }

    let rawText = body.candidates[0].content.parts[0].text || "{}";
    rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(rawText);

    // Filter isolated measurements as an additional deterministic safety gate
    const isolatedMeasureRegex = /^\s*(?:\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s*(?:x\s*)?(?:g|kg|grams?|kilos?|kilograms?|mg|ml|mL|l|L|litres?|cups?|tbsp|tsp|teaspoons?|tablespoons?|degrees?|°[CF]?|mm|cm|m|metres?|inches?|pinch|dash|handful)\s*$/i;
    const cleanIngredients = (parsed.ingredients || []).filter(function(item) {
      return item && !isolatedMeasureRegex.test(item.trim());
    });

    const newState = {
      tools: parsed.tools || [],
      ingredients: cleanIngredients,
      techniques: parsed.techniques || []
    };

    writeStateToSheet_(newState);

    return {
      success: true,
      tools: newState.tools,
      ingredients: newState.ingredients,
      techniques: newState.techniques
    };

  } catch (err) {
    return { success: false, message: "Classification failed: " + err.message };
  }
}

// ============================================================================
// 3. FOLDER & EXPORT UTILITIES
// ============================================================================

function getOrCreateFolder_() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function formatTimestamp_(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function formatReadableDateTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || "Australia/Sydney", "EEEE, MMMM d, yyyy 'at' h:mm a");
}

function sanitizeTitle_(title) {
  if (!title || typeof title !== 'string') return "Demonstration";
  const cleaned = title.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
  return cleaned.length > 0 ? cleaned.substring(0, 50) : "Demonstration";
}

function buildStructuredSections_(transcriptLog) {
  const steps = [];
  const techniques = [];
  const rawLines = [];

  (transcriptLog || []).forEach(function(entry) {
    const line = `[${entry.time}] ${entry.text}`;
    rawLines.push(line);
    if (entry.type === "STEP") steps.push(line);
    else if (entry.type === "TECHNIQUE") techniques.push(line);
  });

  return { steps: steps, techniques: techniques, rawLines: rawLines };
}

function buildSuccessCriteria_(sections) {
  const criteria = [];
  sections.steps.forEach(function(step) {
    const text = step.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
    criteria.push(`Accurately sequence & execute: "${text}"`);
  });
  sections.techniques.forEach(function(tech) {
    const text = tech.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
    criteria.push(`Demonstrate safety/quality standard: "${text}"`);
  });
  return criteria;
}

function decodeBase64Image_(base64Image, fileNamePrefix) {
  if (!base64Image) return null;
  const match = /^data:(.+);base64,(.*)$/s.exec(base64Image);
  const mimeType = match ? match[1] : "image/png";
  const clean = match ? match[2] : base64Image;
  const bytes = Utilities.base64Decode(clean);
  return Utilities.newBlob(bytes, mimeType, `${fileNamePrefix}.png`);
}

// ============================================================================
// 4. DEMONSTRATION SAVER & GOOGLE DOC GENERATOR
// ============================================================================

function saveDemonstrationPackage(base64Video, transcriptLog, meta, sessionTitle, thumbnailBase64) {
  try {
    meta = meta || {};
    const now = new Date();
    const folder = getOrCreateFolder_();
    const timestamp = formatTimestamp_(now);
    const titleSlug = sanitizeTitle_(sessionTitle);
    const displayTitle = (sessionTitle && sessionTitle.trim()) ? sessionTitle.trim() : "Demonstration Lesson";

    let videoFile = null;

    // Decode and save video file (if recording was enabled)
    if (base64Video) {
      let cleanBase64 = base64Video;
      let mimeType = meta.mimeType || "video/webm";
      const dataUrlMatch = /^data:(.+);base64,(.*)$/s.exec(base64Video);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        cleanBase64 = dataUrlMatch[2];
      }

      const extension = mimeType.indexOf("mp4") !== -1 ? "mp4" : "webm";
      const videoFileName = `${titleSlug}_${timestamp}.${extension}`;
      const decodedBytes = Utilities.base64Decode(cleanBase64);
      const videoBlob = Utilities.newBlob(decodedBytes, mimeType, videoFileName);

      videoFile = folder.createFile(videoBlob);
      videoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    const sections = buildStructuredSections_(transcriptLog);
    const successCriteria = buildSuccessCriteria_(sections);
    const state = readStateFromSheet_();

    const durationSeconds = Math.round(meta.durationSeconds || 0);
    const durMin = Math.floor(durationSeconds / 60);
    const durSec = durationSeconds % 60;
    const durationStr = `${durMin} min ${durSec} sec`;

    // Create demonstration summary Google Doc
    const docName = `${titleSlug} - Lesson Package (${timestamp})`;
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();
    body.clear();

    body.appendParagraph(displayTitle).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph("Classroom Practical Demonstration & Assessment Criteria")
        .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

    // Embed snapshot thumbnail if captured
    const thumbBlob = decodeBase64Image_(thumbnailBase64, `${titleSlug}_thumbnail`);
    if (thumbBlob) {
      try {
        const img = body.appendImage(thumbBlob);
        img.setWidth(360);
        img.setHeight(Math.round(360 * (img.getHeight() / img.getWidth())) || 202);
      } catch (imgErr) {
        body.appendParagraph("(Snapshot preview unavailable)").setItalic(true);
      }
    }

    // Overview Metadata
    body.appendParagraph("Overview").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Focus Skill / Project: ${displayTitle}`);
    body.appendParagraph(`Demonstrated: ${formatReadableDateTime_(now)}`);
    body.appendParagraph(`Recorded Duration: ${durationStr}`);

    if (videoFile) {
      const videoPara = body.appendParagraph("Video Recording: ");
      videoPara.appendText(videoFile.getUrl()).setLinkUrl(videoFile.getUrl());
    } else {
      body.appendParagraph("Video Recording: Audio & live transcription only.").setItalic(true);
    }

    // Materials / Ingredients
    body.appendParagraph("Materials & Ingredients").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (state.ingredients && state.ingredients.length > 0) {
      state.ingredients.forEach(function(item) {
        body.appendListItem(item).setGlyphType(DocumentApp.GlyphType.BULLET);
      });
    } else {
      body.appendParagraph("No specific materials or ingredients identified.").setItalic(true);
    }

    // Tools & Equipment
    body.appendParagraph("Tools & Equipment").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (state.tools && state.tools.length > 0) {
      state.tools.forEach(function(tool) {
        body.appendListItem(tool).setGlyphType(DocumentApp.GlyphType.BULLET);
      });
    } else {
      body.appendParagraph("No tools or equipment identified.").setItalic(true);
    }

    // Procedural Sequence
    body.appendParagraph("Step-by-Step Procedure").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.steps.length > 0) {
      sections.steps.forEach(function(step) {
        body.appendListItem(step).setGlyphType(DocumentApp.GlyphType.NUMBER);
      });
    } else {
      body.appendParagraph("No discrete procedural steps flagged.").setItalic(true);
    }

    // Techniques & Safety
    body.appendParagraph("Techniques & Safety Rules").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.techniques.length > 0) {
      sections.techniques.forEach(function(tech) {
        const li = body.appendListItem(tech);
        li.setGlyphType(DocumentApp.GlyphType.BULLET);
        li.editAsText().setForegroundColor("#c0392b");
      });
    } else {
      body.appendParagraph("No safety or specific technique points flagged.").setItalic(true);
    }

    // Rubric / Success Criteria
    body.appendParagraph("Success Criteria (Rubric Checkpoints)").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (successCriteria.length > 0) {
      successCriteria.forEach(function(criterion) {
        body.appendListItem(criterion).setGlyphType(DocumentApp.GlyphType.CHECKBOX);
      });
    } else {
      body.appendParagraph("No criteria derived from this session.").setItalic(true);
    }

    // Full Raw Timestamped Transcript
    body.appendParagraph("Spoken Transcript Log").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.rawLines.length > 0) {
      sections.rawLines.forEach(function(line) {
        body.appendParagraph(line).setFontSize(9.5).setForegroundColor("#555555");
      });
    } else {
      body.appendParagraph("No spoken transcript captured.").setItalic(true);
    }

    doc.saveAndClose();

    // Move doc into the dedicated folder
    const docFile = DriveApp.getFileById(doc.getId());
    folder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);
    docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      videoUrl: videoFile ? videoFile.getUrl() : null,
      docUrl: doc.getUrl(),
      message: "Demonstration saved successfully."
    };

  } catch (err) {
    return {
      success: false,
      message: "Save failed: " + err.message
    };
  }
}
