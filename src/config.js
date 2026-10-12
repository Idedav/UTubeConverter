"use strict";

const _oFs = require("node:fs");
const _oPath = require("node:path");
const _oStringUtils = require("./utils/string");

const _oDefaultConfig = Object.freeze({
  outputDirectory: "C:\\UTubeConverterMusic",
  audioFormat: "mp3",
  audioBitrate: "192K",
  skipExisting: true,
  maxRetries: 3,
  retryDelayMs: 2000,
  timeoutMs: 1200000
});

function MyValidateConfig(oInput, sConfigPath) {
  // Valida le impostazioni senza scartare le altre opzioni corrette.
  let oConfig = { ..._oDefaultConfig };
  let aWarnings = [];
  let sOutputDirectory = "";
  let iMaxRetries = 0;
  let iRetryDelayMs = 0;
  let iTimeoutMs = 0;

  if ((oInput !== null) && (typeof oInput === "object") && !Array.isArray(oInput)) {
    if ((typeof oInput.outputDirectory === "string") && (oInput.outputDirectory.trim().length > 0)) {
      oConfig.outputDirectory = _oPath.resolve(oInput.outputDirectory.trim());
    } else if (Object.hasOwn(oInput, "outputDirectory")) {
      aWarnings.push("outputDirectory non valida: uso C:\\UTubeConverterMusic.");
    }

    if (oInput.audioFormat === "mp3") {
      oConfig.audioFormat = oInput.audioFormat;
    } else if (Object.hasOwn(oInput, "audioFormat")) {
      aWarnings.push("audioFormat non supportato: uso mp3.");
    }

    if ((typeof oInput.audioBitrate === "string") && (/^(128|192|256|320)K$/i.test(oInput.audioBitrate))) {
      oConfig.audioBitrate = oInput.audioBitrate.toUpperCase();
    } else if (Object.hasOwn(oInput, "audioBitrate")) {
      aWarnings.push("audioBitrate non valida: uso 192K.");
    }

    if (typeof oInput.skipExisting === "boolean") {
      oConfig.skipExisting = oInput.skipExisting;
    } else if (Object.hasOwn(oInput, "skipExisting")) {
      aWarnings.push("skipExisting non valido: uso true.");
    }

    iMaxRetries = Number(oInput.maxRetries);
    if (Number.isInteger(iMaxRetries) && (iMaxRetries >= 0) && (iMaxRetries <= 10)) {
      oConfig.maxRetries = iMaxRetries;
    } else if (Object.hasOwn(oInput, "maxRetries")) {
      aWarnings.push("maxRetries deve essere un intero tra 0 e 10: uso 3.");
    }

    iRetryDelayMs = Number(oInput.retryDelayMs);
    if (Number.isInteger(iRetryDelayMs) && (iRetryDelayMs >= 0) && (iRetryDelayMs <= 60000)) {
      oConfig.retryDelayMs = iRetryDelayMs;
    } else if (Object.hasOwn(oInput, "retryDelayMs")) {
      aWarnings.push("retryDelayMs deve essere tra 0 e 60000: uso 2000.");
    }

    iTimeoutMs = Number(oInput.timeoutMs);
    if (Number.isInteger(iTimeoutMs) && (iTimeoutMs >= 30000) && (iTimeoutMs <= 7200000)) {
      oConfig.timeoutMs = iTimeoutMs;
    } else if (Object.hasOwn(oInput, "timeoutMs")) {
      aWarnings.push("timeoutMs deve essere tra 30000 e 7200000: uso 1200000.");
    }
  } else {
    aWarnings.push(_oStringUtils.MyConcat("Configurazione non valida in ", sConfigPath, ": uso i valori predefiniti."));
  }

  sOutputDirectory = _oPath.resolve(oConfig.outputDirectory);
  oConfig.outputDirectory = sOutputDirectory;

  return { bOk: true, oConfig: oConfig, aWarnings: aWarnings };
}

async function MyLoadConfig(sConfigPath) {
  // Carica il file JSON e lo crea solo quando non esiste.
  let oResult = { bOk: false, oConfig: null, sError: "" };
  let sConfigText = "";
  let oRawConfig = null;
  let oValidation = null;
  let bConfigExists = false;

  try {
    await _oFs.promises.access(sConfigPath, _oFs.constants.F_OK);
    bConfigExists = true;
  } catch (oError) {
    if (oError.code === "ENOENT") {
      bConfigExists = false;
    } else {
      oResult.sError = _oStringUtils.MyConcat("Impossibile leggere la configurazione: ", oError.message);
    }
  }

  if (oResult.sError.length === 0) {
    if (bConfigExists) {
      try {
        sConfigText = await _oFs.promises.readFile(sConfigPath, "utf8");
        oRawConfig = JSON.parse(sConfigText);
      } catch (oError) {
        oResult.sError = _oStringUtils.MyConcat("Configurazione JSON non leggibile: ", oError.message);
      }
    } else {
      oRawConfig = { ..._oDefaultConfig };
      try {
        await _oFs.promises.writeFile(sConfigPath, _oStringUtils.MyConcat(JSON.stringify(oRawConfig, null, 2), "\n"), "utf8");
      } catch (oError) {
        oResult.sError = _oStringUtils.MyConcat("Impossibile creare config.json: ", oError.message);
      }
    }
  }

  if (oResult.sError.length === 0) {
    oValidation = MyValidateConfig(oRawConfig, sConfigPath);
    oResult.bOk = true;
    oResult.oConfig = oValidation.oConfig;
    oResult.aWarnings = oValidation.aWarnings;
  }

  return oResult;
}

module.exports = {
  MyLoadConfig: MyLoadConfig,
  MyValidateConfig: MyValidateConfig
};
