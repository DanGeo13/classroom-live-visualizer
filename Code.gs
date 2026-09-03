/**
 * Classroom Live Visualizer - Backend API
 * Deploy as a Web App (Execute as: Me, Access: Anyone).
 * This version is a headless JSON API only — the UI lives on GitHub Pages
 * and calls this endpoint via fetch(), avoiding the Apps Script iframe
 * camera/microphone permissions bug entirely.
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
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === "saveDemonstrationPackage") {
      responseObj = saveDemonstrationPackage(
        payload.base64Video,
        payload.transcriptLog,
        payload.meta
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
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(FOLDER_NAME);
}

function formatTimestamp_(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d}_${hh}-${mm}-${ss}`;
}

function formatReadableDateTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || "Australia/Sydney", "EEEE, MMMM d, yyyy 'at' h:mm a");
}

function buildStructuredSections_(transcriptLog) {
  const steps = [];
  const techniques = [];
  const rawLines = [];

  transcriptLog.forEach(function(entry) {
    const line = `[${entry.time}] ${entry.text}`;
    rawLines.push(line);
    if (entry.type === "STEP") {
      steps.push(line);
    } else if (entry.type === "TECHNIQUE") {
      techniques.push(line);
    }
  });

  return { steps: steps, techniques: techniques, rawLines: rawLines };
}

function saveDemonstrationPackage(base64Video, transcriptLog, meta) {
  try {
    meta = meta || {};
    const now = new Date();
    const folder = getOrCreateFolder_();
    const timestamp = formatTimestamp_(now);

    let cleanBase64 = base64Video;
    let mimeType = meta.mimeType || "video/webm";
    const dataUrlMatch = /^data:(.+);base64,(.*)$/s.exec(base64Video);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      cleanBase64 = dataUrlMatch[2];
    }

    const extension = mimeType.indexOf("mp4") !== -1 ? "mp4" : "webm";
    const videoFileName = `Demo_${timestamp}.${extension}`;

    const decodedBytes = Utilities.base64Decode(cleanBase64);
    const videoBlob = Utilities.newBlob(decodedBytes, mimeType, videoFileName);
    const videoFile = folder.createFile(videoBlob);
    videoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const sections = buildStructuredSections_(transcriptLog || []);

    const durationSeconds = Math.round(meta.durationSeconds || 0);
    const durMin = Math.floor(durationSeconds / 60);
    const durSec = durationSeconds % 60;
    const durationStr = `${durMin} min ${durSec} sec`;

    const docName = `Demo Log_${timestamp}`;
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();
    body.clear();

    body.appendParagraph("Classroom Demonstration Report")
      .setHeading(DocumentApp.ParagraphHeading.TITLE);

    body.appendParagraph("Demonstration Overview")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Date & Time: ${formatReadableDateTime_(now)}`);
    body.appendParagraph(`Total Duration: ${durationStr}`);

    const videoPara = body.appendParagraph("Recorded Video: ");
    videoPara.appendText(videoFile.getUrl()).setLinkUrl(videoFile.getUrl());

    body.appendParagraph("Structured Procedural Steps")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.steps.length > 0) {
      sections.steps.forEach(function(step) {
        body.appendListItem(step).setGlyphType(DocumentApp.GlyphType.NUMBER);
      });
    } else {
      body.appendParagraph("No distinct steps were detected during this session.").setItalic(true);
    }

    body.appendParagraph("Key Techniques & Safety Cues")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (sections.techniques.length > 0) {
      sections.techniques.forEach(function(tech) {
        const li = body.appendListItem(tech);
        li.setGlyphType(DocumentApp.GlyphType.BULLET);
        li.editAsText().setForegroundColor("#c0392b");
      });
    } else {
      body.appendParagraph("No technique or safety cues were detected during this session.").setItalic(true);
    }

    body.appendParagraph("Full Raw Transcript")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
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
      videoUrl: videoFile.getUrl(),
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
