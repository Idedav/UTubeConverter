"use strict";

const _oCrypto = require("node:crypto");
const _oFs = require("node:fs");
const _oPath = require("node:path");
const _oStringUtils = require("./utils/string");

async function MyEnsureDirectory(sPath) {
  // Crea una directory se manca e verifica che sia accessibile in scrittura.
  let oResult = { bOk: false, sError: "" };

  try {
    await _oFs.promises.mkdir(sPath, { recursive: true });
    await _oFs.promises.access(sPath, _oFs.constants.W_OK);
    oResult.bOk = true;
  } catch (oError) {
    oResult.sError = _oStringUtils.MyConcat("Cartella non accessibile: ", sPath, " (", oError.message, ")");
  }

  return oResult;
}

async function MyEnsureApplicationDirectories(sOutputDirectory) {
  // Prepara la destinazione e le directory applicative nascoste.
  let oResult = { bOk: false, sError: "", oPaths: null };
  let oPaths = {
    sOutputDirectory: sOutputDirectory,
    sAppDataDirectory: _oPath.join(sOutputDirectory, ".appdata"),
    sTempDirectory: _oPath.join(sOutputDirectory, ".appdata", "tmp"),
    sLogDirectory: _oPath.join(sOutputDirectory, ".appdata", "logs"),
    sMetadataDirectory: _oPath.join(sOutputDirectory, ".appdata", "metadata"),
    sHistoryPath: _oPath.join(sOutputDirectory, ".appdata", "history.json")
  };
  let aDirectories = [
    oPaths.sOutputDirectory,
    oPaths.sAppDataDirectory,
    oPaths.sTempDirectory,
    oPaths.sLogDirectory,
    oPaths.sMetadataDirectory
  ];
  let oDirectoryResult = null;
  let iIndex = 0;
  let bProceed = true;

  for (iIndex = 0; (iIndex < aDirectories.length) && bProceed; iIndex += 1) {
    oDirectoryResult = await MyEnsureDirectory(aDirectories[iIndex]);
    if (!oDirectoryResult.bOk) {
      bProceed = false;
      oResult.sError = oDirectoryResult.sError;
    }
  }

  if (bProceed) {
    oResult.bOk = true;
    oResult.oPaths = oPaths;
  }

  return oResult;
}

async function MyCreateTempDirectory(sTempRoot) {
  // Crea una cartella temporanea isolata per un tentativo di download.
  let oResult = { bOk: false, sPath: "", sError: "" };
  let sTempPath = _oPath.join(sTempRoot, _oCrypto.randomUUID());

  try {
    await _oFs.promises.mkdir(sTempPath, { recursive: false });
    oResult.bOk = true;
    oResult.sPath = sTempPath;
  } catch (oError) {
    oResult.sError = _oStringUtils.MyConcat("Impossibile creare l'area temporanea: ", oError.message);
  }

  return oResult;
}

async function MyRemoveDirectory(sPath) {
  // Rimuove solo la cartella temporanea del tentativo corrente.
  let oResult = { bOk: false, sError: "" };

  try {
    await _oFs.promises.rm(sPath, { recursive: true, force: true });
    oResult.bOk = true;
  } catch (oError) {
    oResult.sError = _oStringUtils.MyConcat("Impossibile eliminare i file temporanei: ", oError.message);
  }

  return oResult;
}

async function MyReadUrlFile(sFilePath) {
  // Legge URL singoli ignorando righe vuote e commenti.
  let oResult = { bOk: false, aUrls: [], sError: "" };
  let sContent = "";
  let aLines = [];
  let sLine = "";

  try {
    sContent = await _oFs.promises.readFile(sFilePath, "utf8");
    aLines = sContent.split(/\r?\n/);
    for (sLine of aLines) {
      sLine = sLine.trim();
      if ((sLine.length > 0) && !sLine.startsWith("#")) {
        oResult.aUrls.push(sLine);
      }
    }
    oResult.bOk = true;
  } catch (oError) {
    oResult.sError = _oStringUtils.MyConcat("Impossibile leggere il file URL: ", oError.message);
  }

  return oResult;
}

async function MyWriteJson(sFilePath, oValue) {
  // Salva JSON con sostituzione atomica per limitare file incompleti.
  let oResult = { bOk: false, sError: "" };
  let sTemporaryPath = _oStringUtils.MyConcat(sFilePath, ".", _oCrypto.randomUUID(), ".tmp");

  try {
    await _oFs.promises.writeFile(sTemporaryPath, _oStringUtils.MyConcat(JSON.stringify(oValue, null, 2), "\n"), "utf8");
    await _oFs.promises.rename(sTemporaryPath, sFilePath);
    oResult.bOk = true;
  } catch (oError) {
    try {
      await _oFs.promises.rm(sTemporaryPath, { force: true });
    } catch (oCleanupError) {
      oResult.sError = _oStringUtils.MyConcat(oError.message, " (pulizia temporanea: ", oCleanupError.message, ")");
    }
    if (oResult.sError.length === 0) {
      oResult.sError = oError.message;
    }
  }

  return oResult;
}

module.exports = {
  MyEnsureDirectory: MyEnsureDirectory,
  MyEnsureApplicationDirectories: MyEnsureApplicationDirectories,
  MyCreateTempDirectory: MyCreateTempDirectory,
  MyRemoveDirectory: MyRemoveDirectory,
  MyReadUrlFile: MyReadUrlFile,
  MyWriteJson: MyWriteJson
};
