/**
 * Classroom Live Visualizer - Backend API (v5)
 * Deploy as a Web App (Execute as: Me, Access: Anyone).
 *
 * v5 change: classifyWithGemini_ is now STATEFUL. Each call receives the
 * CURRENT authoritative lists (tools/ingredients/techniques) plus only the
 * newest transcript lines, and Gemini returns the full corrected lists —
 * refining quantities in place ("300g" -> "500g of sifted flour" becomes
 * ONE updated entry, not two) and removing items explicitly cancelled
 * ("don't worry about the sifted flour" removes it from the list).
 *
 * SETUP REQUIRED: Script Properties > GEMINI_API_KEY (see earlier setup).
 * IMPORTANT: create a NEW deployment version after editing this file.
 */

const FOLDER_NAME = "Classroom Demonstrations";
const GEMINI_MODEL = "gemini-2.5-flash-lite";

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok", message: "Classroom Live Visualizer API is running." })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let responseObj;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No POST body received.");
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
      responseObj = classifyWithGemini_(payload.lines, payload.domain, payload.currentState);
    } else {
      responseObj = { success: false, message: "Unknown action: " + action };
    }
  } catch (err) {
    responseObj = { success: false, message: "Server error: " + err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(responseObj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Stateful reconciliation: sends Gemini the CURRENT tracked lists plus the
 * newest transcript lines, and asks for the FULL corrected lists back —
 * refining, replacing, or removing entries as the transcript dictates,
 * rather than blindly appending.
 * Returns: { success, tools: [...], ingredients: [...], techniques: [...] }
 */
function classifyWithGemini_(lines, domain, currentState) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { success: false, message: "GEMINI_API_KEY is not set in Script Properties." };
    }
    if (!lines || lines.length === 0) {
      return {
        success: true,
        tools: (currentState && currentState.tools) || [],
        ingredients: (currentState && currentState.ingredients) || [],
        techniques: (currentState && currentState.techniques) || []
      };
    }

    const state = currentState || { tools: [], ingredients: [], techniques: [] };
    const transcriptText = lines.map(function(l) {
      return `[${l.time}] ${l.text}`;
    }).join('\n');

    const domainLabel = domain || "general practical demonstration";

    const prompt =
      "You are maintaining a live, continuously corrected classroom worksheet for a " + domainLabel + " demonstration.\n\n" +
      "CURRENT STATE (the ground truth tracked so far):\n" +
      "TOOLS: " + JSON.stringify(state.tools || []) + "\n" +
      "INGREDIENTS: " + JSON.stringify(state.ingredients || []) + "\n" +
      "TECHNIQUES: " + JSON.stringify(state.techniques || []) + "\n\n" +
      "NEW TRANSCRIPT LINES spoken since the last update:\n" + transcriptText + "\n\n" +
      "Update the three lists according to these rules:\n" +
      "1. REFINE IN PLACE: if a new line corrects or adds detail to an item already tracked " +
      "(e.g. \"actually make that 500 grams\" after \"300 grams of sifted flour\" was already tracked), " +
      "REPLACE that existing entry with the corrected version. Never keep both the old and new version, " +
      "and never add it again as a separate entry.\n" +
      "2. REMOVE ON CANCELLATION: if a new line explicitly cancels, negates, or says an item is no longer " +
      "needed (e.g. \"don't worry about the sifted flour\", \"we don't need the drill anymore\", \"scratch that\"), " +
      "REMOVE that item entirely from its list.\n" +
      "3. ADD NEW: if a new line introduces a genuinely new tool, ingredient, or technique not already tracked, add it. " +
      "Recognize tools/ingredients even if described in everyday words rather than technical names " +
      "(e.g. \"large metal bowl\" is a valid tool entry).\n" +
      "4. PRESERVE: leave every other existing entry unchanged if the new lines don't affect it.\n" +
      "5. MERGE: if a new line paraphrases something already tracked, merge into the single existing entry rather than duplicating.\n\n" +
      "Respond with ONLY valid minified JSON — the COMPLETE corrected lists (not a diff, not just the changes), " +
      "in exactly this shape, no markdown, no explanation:\n" +
      "{\"tools\":[\"...\"],\"ingredients\":[\"...\"],\"techniques\":[\"...\"]}";

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + apiKey;
    const requestPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 768 }
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
      return { success: false, message: "Gemini API returned status " + status + ": " + bodyText.substring(0, 200) };
    }

    const body = JSON.parse(bodyText);
    if (!body.candidates || !body.candidates[0] || !body.candidates[0].content) {
      return { success: false, message: "Unexpected Gemini response shape." };
    }

    let rawText = body.candidates[0].content.parts[0].text || "";
    rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(rawText);
    return {
      success: true,
      tools: parsed.tools || [],
      ingredients: parsed.ingredients || [],
      techniques: parsed.techniques || []
    };

  } catch (err) {
    return { success: false, message: "Gemini classification failed: " + err.message };
  }
}

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
  if (!title || typeof title !== 'string') return "Untitled_Demo";
  const cleaned = title.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
  return cleaned.length > 0 ? cleaned.substring(0, 60) : "Untitled_Demo";
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
    criteria.push(`Student completes the step: "${text}"`);
  });
  sections.techniques.forEach(function(tech) {
    const text = tech.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
    criteria.push(`Student correctly demonstrates the technique/safety cue: "${text}"`);
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

function saveDemonstrationPackage(base64Video, transcriptLog, meta, sessionTitle, thumbnailBase64) {
  try {
    meta = meta || {};
    const now = new Date();
    const folder = getOrCreateFolder_();
    const timestamp = formatTimestamp_(now);
    const titleSlug = sanitizeTitle_(sessionTitle);
    const displayTitle = (sessionTitle && sessionTitle.trim()) ? sessionTitle.trim() : "Untitled Demonstration";

    let videoFile = null;

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

    const durationSeconds = Math.round(meta.durationSeconds || 0);
    const durMin = Math.floor(durationSeconds / 60);
    const durSec = durationSeconds % 60;
    const durationStr = `${durMin} min ${durSec} sec`;

    const docName = `${titleSlug} - Demo Log_${timestamp}`;
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();
    body.clear();

    body.appendParagraph(displayTitle).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph("Classroom Demonstration Report").setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

    const thumbBlob = decodeBase64Image_(thumbnailBase64, `${titleSlug}_thumbnail`);
    if (thumbBlob) {
      try {
        const img = body.appendImage(thumbBlob);
        img.setWidth(360);
        img.setHeight(Math.round(360 * (img.getHeight() / img.getWidth())) || 202);
      } catch (imgErr) {
        body.appendParagraph("(Thumbnail could not be embedded: " + imgErr.message + ")").setItalic(true);
      }
    }

    body.appendParagraph("Demonstration Overview").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Focus / Recipe / Skill: ${displayTitle}`);
    body.appendParagraph(`Date & Time: ${formatReadableDateTime_(now)}`);
    body.appendParagraph(`Total Duration: ${durationStr}`);

    if (videoFile) {
      const videoPara = body.appendParagraph("Recorded Video: ");
      videoPara.appendText(videoFile.getUrl()).setLinkUrl(videoFile.getUrl());
    } else {
      body.appendParagraph("Recorded Video: none (this session ran without recording).").setItalic(true);
    }

    body.appendParagraph("Structured Procedural Steps").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.steps.length > 0) {
      sections.steps.forEach(function(step) {
        body.appendListItem(step).setGlyphType(DocumentApp.GlyphType.NUMBER);
      });
    } else {
      body.appendParagraph("No distinct steps were detected during this session.").setItalic(true);
    }

    body.appendParagraph("Key Techniques & Safety Cues").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.techniques.length > 0) {
      sections.techniques.forEach(function(tech) {
        const li = body.appendListItem(tech);
        li.setGlyphType(DocumentApp.GlyphType.BULLET);
        li.editAsText().setForegroundColor("#c0392b");
      });
    } else {
      body.appendParagraph("No technique or safety cues were detected during this session.").setItalic(true);
    }

    body.appendParagraph("Success Criteria").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (successCriteria.length > 0) {
      successCriteria.forEach(function(c) {
        const li = body.appendListItem(c);
        li.setGlyphType(DocumentApp.GlyphType.BULLET);
      });
    } else {
      body.appendParagraph("No steps or techniques were detected to generate success criteria from.").setItalic(true);
    }

    body.appendParagraph("Full Raw Transcript").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.rawLines.length > 0) {
      sections.rawLines.forEach(function(line) {
        body.appendParagraph(line).setFontSize(10);
      });
    } else {
      body.appendParagraph("No transcript captured.").setItalic(true);
    }

    doc.saveAndClose();

    const docFile = DriveApp.getFileById(doc.getId());
    docFile.moveTo(folder);
    docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      videoUrl: videoFile ? videoFile.getUrl() : null,
      docUrl: doc.getUrl(),
      message: "Demonstration package saved successfully."
    };

  } catch (err) {
    return {
      success: false,
      message: "Error saving demonstration: " + err.message
    };
  }
}
