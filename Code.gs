/**
 * Classroom Live Visualizer - Backend API (v3)
 * Deploy as a Web App (Execute as: Me, Access: Anyone).
 * Supports optional video: if base64Video is null/empty (Transcribe-only
 * or Display-only sessions), saves a Doc from the transcript alone.
 * IMPORTANT: after editing this file, create a NEW deployment version
 * (Deploy > Manage deployments > pencil icon > New version > Deploy).
 */

const FOLDER_NAME = "Classroom Demonstrations";

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
    } else {
      responseObj = { success: false, message: "Unknown action: " + action };
    }
  } catch (err) {
    responseObj = { success: false, message: "Server error: " + err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(responseObj))
    .setMimeType(ContentService.MimeType.JSON);
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

/**
 * Decodes optional video + optional thumbnail, saves to Drive, builds a
 * structured Google Doc. Video is entirely optional — if base64Video is
 * null/empty (Transcribe-only or Display-only sessions), the Doc is still
 * created from the transcript, just without a linked video file.
 */
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
