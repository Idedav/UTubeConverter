"use strict";

const _oProcessRunner = require("./processRunner");
const _oYoutubeDlModule = require("./youtubeDl");
const _oStringUtils = require("./utils/string");

function MyIsSupportedPython(sVersionText) {
  // Verifica che la versione Python individuata sia almeno 3.9.
  let bResult = false;
  let oVersion = null;
  let iMajor = 0;
  let iMinor = 0;

  oVersion = sVersionText.match(/Python\s+(\d+)\.(\d+)/i);
  if (oVersion !== null) {
    iMajor = Number(oVersion[1]);
    iMinor = Number(oVersion[2]);
    bResult = (iMajor > 3) || ((iMajor === 3) && (iMinor >= 9));
  }

  return bResult;
}

async function MyCheckSystem(sFfmpegCommand, sFfprobeCommand) {
  // Verifica Node, Python, yt-dlp, FFmpeg e ffprobe prima di iniziare.
  let oResult = { bOk: false, aErrors: [], oVersions: {} };
  let oPython = null;
  let oYtDlp = null;
  let oYoutubeProcess = null;
  let oYoutubeDetails = null;
  let sPythonText = "";
  let sYoutubeOutput = "";
  let sYtDlpError = "";
  let bPythonOk = false;
  let bYtDlpOk = false;
  let oFfmpeg = null;
  let oFfprobe = null;

  if (Number(process.versions.node.split(".")[0]) < 20) {
    oResult.aErrors.push("È richiesto Node.js 20 o successivo.");
  } else {
    oResult.oVersions.node = process.versions.node;
  }

  oPython = await _oProcessRunner.MyRunProcess("python", ["--version"], 10000);
  sPythonText = _oStringUtils.MyConcat(oPython.sStdout, oPython.sStderr).trim();
  bPythonOk = oPython.bOk && MyIsSupportedPython(sPythonText);
  if (!bPythonOk) {
    oPython = await _oProcessRunner.MyRunProcess("python3", ["--version"], 10000);
    sPythonText = _oStringUtils.MyConcat(oPython.sStdout, oPython.sStderr).trim();
    bPythonOk = oPython.bOk && MyIsSupportedPython(sPythonText);
  }
  if (!bPythonOk) {
    oPython = await _oProcessRunner.MyRunProcess("py", ["-3", "--version"], 10000);
    sPythonText = _oStringUtils.MyConcat(oPython.sStdout, oPython.sStderr).trim();
    bPythonOk = oPython.bOk && MyIsSupportedPython(sPythonText);
  }
  if (bPythonOk) {
    oResult.oVersions.python = sPythonText;
  } else {
    oResult.aErrors.push("Python 3.9 o successivo non è disponibile; è richiesto da youtube-dl-exec.");
  }

  oYtDlp = _oYoutubeDlModule.MyGetYoutubeDl();
  if (oYtDlp.bOk) {
    try {
      oYoutubeProcess = oYtDlp.oYoutubeDl.exec(
        "https://www.youtube.com/",
        { version: true },
        { timeout: 10000, windowsHide: true }
      );
      if ((oYoutubeProcess.stdout !== undefined) && (oYoutubeProcess.stdout !== null) && (typeof oYoutubeProcess.stdout.on === "function")) {
        oYoutubeProcess.stdout.on("data", (oChunk) => {
          sYoutubeOutput = _oStringUtils.MyConcat(sYoutubeOutput, oChunk.toString());
        });
      }
      if ((oYoutubeProcess.stderr !== undefined) && (oYoutubeProcess.stderr !== null) && (typeof oYoutubeProcess.stderr.on === "function")) {
        oYoutubeProcess.stderr.on("data", (oChunk) => {
          sYoutubeOutput = _oStringUtils.MyConcat(sYoutubeOutput, oChunk.toString());
        });
      }
      oYoutubeDetails = await oYoutubeProcess;
      if ((oYoutubeDetails !== null) && (typeof oYoutubeDetails.stdout === "string")) {
        sYoutubeOutput = oYoutubeDetails.stdout;
      }
      bYtDlpOk = sYoutubeOutput.trim().length > 0;
      if (bYtDlpOk) {
        oResult.oVersions.ytDlp = sYoutubeOutput.trim();
      } else {
        oResult.aErrors.push("yt-dlp non ha restituito una versione valida.");
      }
    } catch (oError) {
      sYtDlpError = oError.message || oError.code || String(oError.stderr || "") || "errore non specificato";
      oResult.aErrors.push(_oStringUtils.MyConcat("yt-dlp non è utilizzabile: ", sYtDlpError));
    }
  } else {
    oResult.aErrors.push(_oStringUtils.MyConcat("Dipendenza youtube-dl-exec non installata: ", oYtDlp.sError));
  }
  oFfmpeg = await _oProcessRunner.MyRunProcess(sFfmpegCommand, ["-version"], 10000);
  if (oFfmpeg.bOk) {
    oResult.oVersions.ffmpeg = (oFfmpeg.sStdout.split(/\r?\n/)[0] || "").trim();
  } else {
    oResult.aErrors.push(_oStringUtils.MyConcat("FFmpeg non trovato o non avviabile: ", oFfmpeg.sStderr.trim()));
  }

  oFfprobe = await _oProcessRunner.MyRunProcess(sFfprobeCommand, ["-version"], 10000);
  if (oFfprobe.bOk) {
    oResult.oVersions.ffprobe = (oFfprobe.sStdout.split(/\r?\n/)[0] || "").trim();
  } else {
    oResult.aErrors.push(_oStringUtils.MyConcat("ffprobe non trovato o non avviabile: ", oFfprobe.sStderr.trim()));
  }

  oResult.bOk = oResult.aErrors.length === 0;
  return oResult;
}

module.exports = {
  MyCheckSystem: MyCheckSystem
};
