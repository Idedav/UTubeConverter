"use strict";

const _oProcessRunner = require("./processRunner");
const _oStringUtils = require("./utils/string");

async function MyValidateMp3(sFilePath, sFfprobeCommand, iTimeoutMs) {
  // Verifica con ffprobe che l'output sia un MP3 leggibile con durata positiva.
  let oResult = { bOk: false, sError: "Il file MP3 non è valido.", oProbe: null };
  let oProcessResult = null;
  let oProbe = null;
  let dDuration = 0;
  let sFormatName = "";

  oProcessResult = await _oProcessRunner.MyRunProcess(sFfprobeCommand, [
    "-v",
    "error",
    "-show_entries",
    "format=format_name,duration",
    "-of",
    "json",
    sFilePath
  ], iTimeoutMs);

  if (!oProcessResult.bOk) {
    oResult.sError = oProcessResult.bTimedOut
      ? "ffprobe ha superato il tempo massimo."
      : _oStringUtils.MyConcat("ffprobe non è riuscito: ", oProcessResult.sStderr.trim());
  } else {
    try {
      oProbe = JSON.parse(oProcessResult.sStdout);
      sFormatName = String((oProbe.format || {}).format_name || "");
      dDuration = Number((oProbe.format || {}).duration);
      if (sFormatName.split(",").includes("mp3") && Number.isFinite(dDuration) && (dDuration > 0)) {
        oResult.bOk = true;
        oResult.sError = "";
        oResult.oProbe = oProbe;
      }
    } catch (oError) {
      oResult.sError = _oStringUtils.MyConcat("Risposta di ffprobe non leggibile: ", oError.message);
    }
  }

  return oResult;
}

module.exports = {
  MyValidateMp3: MyValidateMp3
};
