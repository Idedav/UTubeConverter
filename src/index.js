"use strict";

const _oFs = require("node:fs");
const _oPath = require("node:path");
const _oReadline = require("node:readline/promises");
const _oStdin = require("node:process").stdin;
const _oStdout = require("node:process").stdout;
const _oConfigModule = require("./config");
const _oDownloaderModule = require("./downloader");
const _oDownloadHistoryModule = require("./downloadHistory");
const _oFileManager = require("./fileManager");
const _oLogger = require("./logger");
const _oSystemCheck = require("./systemCheck");
const _oUrlManager = require("./urlManager");
const _oYoutubeDlModule = require("./youtubeDl");
const _oStringUtils = require("./utils/string");

function MyParseArguments(aArgs) {
  // Legge le opzioni CLI senza interpretare URL come comandi shell.
  let oResult = {
    bOk: true,
    sError: "",
    sUrl: "",
    sFilePath: "",
    bForce: false,
    bSingle: false,
    bPlaylist: false,
    bHelp: false
  };
  let sArgument = "";
  let iIndex = 0;

  for (iIndex = 0; iIndex < aArgs.length; iIndex += 1) {
    sArgument = aArgs[iIndex];
    if (sArgument === "--force") {
      oResult.bForce = true;
    } else if (sArgument === "--single") {
      oResult.bSingle = true;
    } else if (sArgument === "--playlist") {
      oResult.bPlaylist = true;
    } else if (sArgument === "--file") {
      if (iIndex + 1 < aArgs.length) {
        iIndex += 1;
        oResult.sFilePath = aArgs[iIndex];
      } else {
        oResult.bOk = false;
        oResult.sError = "Dopo --file è necessario specificare il percorso del file.";
      }
    } else if ((sArgument === "--help") || (sArgument === "-h")) {
      oResult.bHelp = true;
    } else if (sArgument.startsWith("--")) {
      oResult.bOk = false;
      oResult.sError = _oStringUtils.MyConcat("Opzione sconosciuta: ", sArgument);
    } else if (oResult.sUrl.length === 0) {
      oResult.sUrl = sArgument;
    } else {
      oResult.bOk = false;
      oResult.sError = "È possibile specificare un solo URL diretto; per più URL usa --file.";
    }
  }

  if (oResult.bSingle && oResult.bPlaylist) {
    oResult.bOk = false;
    oResult.sError = "Usa --single oppure --playlist, non entrambe.";
  }
  if ((oResult.sFilePath.length > 0) && (oResult.sUrl.length > 0)) {
    oResult.bOk = false;
    oResult.sError = "Usa --file oppure un URL diretto.";
  }

  return oResult;
}

function MyCreateSummary() {
  // Crea un riepilogo vuoto per le operazioni CLI.
  let oSummary = {
    iIdentified: 0,
    iDownloaded: 0,
    iSkipped: 0,
    iFailed: 0,
    aFailures: [],
    bInterrupted: false
  };

  return oSummary;
}

function MyAddSummary(oTarget, oSource) {
  // Accumula i contatori di operazioni multiple.
  if (oSource !== null) {
    oTarget.iIdentified += oSource.iIdentified || 0;
    oTarget.iDownloaded += oSource.iDownloaded || 0;
    oTarget.iSkipped += oSource.iSkipped || 0;
    oTarget.iFailed += oSource.iFailed || 0;
    oTarget.bInterrupted = oTarget.bInterrupted || oSource.bInterrupted || false;
    oTarget.aFailures.push(...(oSource.aFailures || []));
  }

  return null;
}

function MyDisplaySummary(oSummary, sOutputDirectory) {
  // Mostra i risultati dell'operazione nel formato richiesto.
  _oLogger.MyInfo("");
  _oLogger.MyInfo("OPERAZIONE TERMINATA");
  _oLogger.MyInfo(_oStringUtils.MyConcat("Elementi identificati: ", oSummary.iIdentified));
  _oLogger.MyInfo(_oStringUtils.MyConcat("Nuovi download:       ", oSummary.iDownloaded));
  _oLogger.MyInfo(_oStringUtils.MyConcat("Già presenti:         ", oSummary.iSkipped));
  _oLogger.MyInfo(_oStringUtils.MyConcat("Falliti:              ", oSummary.iFailed));
  if (oSummary.bInterrupted) {
    _oLogger.MyInfo("Operazione interrotta con Ctrl+C.");
  }
  _oLogger.MyInfo("");
  _oLogger.MyInfo("Destinazione:");
  _oLogger.MyInfo(sOutputDirectory);

  return null;
}

async function MyRunUrlList(aUrls, oDownloader, bForce, sMode, sOutputDirectory) {
  // Valida, deduplica e processa URL singoli o playlist da una lista.
  let oSummary = MyCreateSummary();
  let oSeen = new Set();
  let sValue = "";
  let sUrl = "";
  let oValidation = null;
  let bPlaylist = false;
  let oOperation = null;
  let sOperationMode = sMode || "auto";
  let sUniqueKey = "";

  for (sValue of aUrls) {
    oValidation = _oUrlManager.MyValidateYoutubeUrl(sValue);
    if (!oValidation.bOk) {
      oSummary.iIdentified += 1;
      oSummary.iFailed += 1;
      oSummary.aFailures.push({ sTitle: sValue, sError: oValidation.sError });
      _oLogger.MyError(oValidation.sError);
    } else {
      sUrl = oValidation.oUrl.toString();
      sUniqueKey = sUrl.toLowerCase();
      if (!oSeen.has(sUniqueKey)) {
        oSeen.add(sUniqueKey);
        bPlaylist = (sOperationMode === "playlist") || ((sOperationMode === "auto") && _oUrlManager.MyIsPlaylistUrl(oValidation.oUrl));
        if (sOperationMode === "single") {
          bPlaylist = false;
        }
        _oLogger.MyInfo(_oStringUtils.MyConcat("Cartella: ", sOutputDirectory));
        try {
          oOperation = await oDownloader.MyDownloadUrl(sUrl, bPlaylist, bForce);
        } catch (oError) {
          oOperation = { oSummary: null, sError: oError.message };
        }
        if (oOperation.oSummary !== null) {
          MyAddSummary(oSummary, oOperation.oSummary);
        } else {
          oSummary.iIdentified += 1;
          oSummary.iFailed += 1;
          oSummary.aFailures.push({ sTitle: sUrl, sError: oOperation.sError });
          _oLogger.MyError(oOperation.sError);
        }
      } else {
        _oLogger.MyInfo(_oStringUtils.MyConcat("URL duplicato nella coda, salto: ", sUrl));
      }
    }
  }

  MyDisplaySummary(oSummary, sOutputDirectory);
  return { bOk: (oSummary.iFailed === 0) && !oSummary.bInterrupted, oSummary: oSummary };
}

async function MyRunUrlFile(sFilePath, oDownloader, bForce, sOutputDirectory) {
  // Importa URL da file di testo e continua anche dopo errori indipendenti.
  let oReadResult = null;
  let oResult = { bOk: false, sError: "", oSummary: MyCreateSummary() };

  oReadResult = await _oFileManager.MyReadUrlFile(sFilePath);
  if (!oReadResult.bOk) {
    oResult.sError = oReadResult.sError;
    _oLogger.MyError(oResult.sError);
  } else if (oReadResult.aUrls.length === 0) {
    oResult.sError = "Il file non contiene URL.";
    _oLogger.MyError(oResult.sError);
  } else {
    oResult = await MyRunUrlList(oReadResult.aUrls, oDownloader, bForce, "auto", sOutputDirectory);
  }

  return oResult;
}

async function MyListDownloads(sOutputDirectory) {
  // Elenca i file MP3 presenti nella directory principale.
  let oResult = { bOk: false, sError: "" };
  let aEntries = [];
  let sEntry = "";
  let iCount = 0;

  try {
    aEntries = await _oFs.promises.readdir(sOutputDirectory);
    for (sEntry of aEntries) {
      if (_oPath.extname(sEntry).toLowerCase() === ".mp3") {
        _oLogger.MyInfo(sEntry);
        iCount += 1;
      }
    }
    if (iCount === 0) {
      _oLogger.MyInfo("Nessun file MP3 nella cartella.");
    }
    _oLogger.MyInfo(_oStringUtils.MyConcat("Totale: ", iCount));
    oResult.bOk = true;
  } catch (oError) {
    oResult.sError = _oStringUtils.MyConcat("Impossibile elencare i download: ", oError.message);
  }

  return oResult;
}

async function MyRunInteractive(oDownloader, sOutputDirectory) {
  // Mostra il menu e gestisce le scelte fino all'uscita o a Ctrl+C.
  let oResult = { bOk: true, bInterrupted: false };
  let oInterface = null;
  let sChoice = "";
  let sValue = "";
  let oValidation = null;
  let oOperation = null;
  let oListResult = null;
  let bExit = false;

  oInterface = _oReadline.createInterface({ input: _oStdin, output: _oStdout });
  try {
    while (!bExit && !oDownloader._bInterrupted) {
      _oLogger.MyInfo("");
      _oLogger.MyInfo("====================================");
      _oLogger.MyInfo("       UTubeConverterMusic");
      _oLogger.MyInfo("====================================");
      _oLogger.MyInfo("1. Scarica un singolo URL");
      _oLogger.MyInfo("2. Scarica una playlist");
      _oLogger.MyInfo("3. Importa URL da file TXT");
      _oLogger.MyInfo("4. Visualizza la cartella download");
      _oLogger.MyInfo("5. Esci");
      sChoice = (await oInterface.question("Seleziona un'opzione: ")).trim();

      if (sChoice === "1") {
        sValue = (await oInterface.question("URL del video: ")).trim();
        oValidation = _oUrlManager.MyValidateYoutubeUrl(sValue);
        if (oValidation.bOk) {
          oOperation = await MyRunUrlList([oValidation.oUrl.toString()], oDownloader, false, "single", sOutputDirectory);
          oResult.bOk = oResult.bOk && oOperation.bOk;
        } else {
          _oLogger.MyError(oValidation.sError);
        }
      } else if (sChoice === "2") {
        sValue = (await oInterface.question("URL della playlist: ")).trim();
        oValidation = _oUrlManager.MyValidateYoutubeUrl(sValue);
        if (oValidation.bOk) {
          oOperation = await MyRunUrlList([oValidation.oUrl.toString()], oDownloader, false, "playlist", sOutputDirectory);
          oResult.bOk = oResult.bOk && oOperation.bOk;
        } else {
          _oLogger.MyError(oValidation.sError);
        }
      } else if (sChoice === "3") {
        sValue = (await oInterface.question("Percorso del file TXT: ")).trim();
        oOperation = await MyRunUrlFile(sValue, oDownloader, false, sOutputDirectory);
        oResult.bOk = oResult.bOk && oOperation.bOk;
      } else if (sChoice === "4") {
        _oLogger.MyInfo(_oStringUtils.MyConcat("Cartella: ", sOutputDirectory));
        oListResult = await MyListDownloads(sOutputDirectory);
        if (!oListResult.bOk) {
          _oLogger.MyError(oListResult.sError);
        }
      } else if (sChoice === "5") {
        bExit = true;
      } else {
        _oLogger.MyWarning("Scelta non valida.");
      }
    }
  } catch (oError) {
    oResult.bOk = false;
    _oLogger.MyError(_oStringUtils.MyConcat("Interazione terminata: ", oError.message));
  } finally {
    oInterface.close();
  }

  oResult.bInterrupted = oDownloader._bInterrupted;
  return oResult;
}

async function MyMain(aArgs) {
  // Prepara configurazione, strumenti esterni e modalità di esecuzione.
  let iExitCode = 1;
  let oArguments = MyParseArguments(aArgs);
  let sConfigPath = _oPath.resolve(__dirname, "..", "config.json");
  let oConfigResult = null;
  let oDirectoryResult = null;
  let oHistory = null;
  let oHistoryResult = null;
  let oYoutubeDl = null;
  let oSystemResult = null;
  let oDownloader = null;
  let oOperation = null;
  let oRunResult = null;
  let oSignalHandler = null;
  let sMode = "auto";
  let sWarning = "";
  let bProceed = true;

  if (oArguments.bHelp) {
    _oLogger.MyInfo("Uso: node src/index.js [--single|--playlist] [--force] URL");
    _oLogger.MyInfo("     node src/index.js --file URL.txt [--force]");
    bProceed = false;
    iExitCode = 0;
  } else if (!oArguments.bOk) {
    _oLogger.MyError(oArguments.sError);
    bProceed = false;
  }

  if (bProceed) {
    oConfigResult = await _oConfigModule.MyLoadConfig(sConfigPath);
    if (!oConfigResult.bOk) {
      _oLogger.MyError(oConfigResult.sError);
      bProceed = false;
    } else {
      for (sWarning of oConfigResult.aWarnings || []) {
        _oLogger.MyWarning(sWarning);
      }
    }
  }

  if (bProceed) {
    oDirectoryResult = await _oFileManager.MyEnsureApplicationDirectories(oConfigResult.oConfig.outputDirectory);
    if (!oDirectoryResult.bOk) {
      _oLogger.MyError(oDirectoryResult.sError);
      bProceed = false;
    }
  }

  if (bProceed) {
    oHistory = new _oDownloadHistoryModule.MyDownloadHistory(oDirectoryResult.oPaths.sHistoryPath);
    oHistoryResult = await oHistory.MyLoad();
    if (!oHistoryResult.bOk) {
      _oLogger.MyError(oHistoryResult.sError);
      bProceed = false;
    }
  }

  if (bProceed) {
    oYoutubeDl = _oYoutubeDlModule.MyGetYoutubeDl();
    if (!oYoutubeDl.bOk) {
      _oLogger.MyError(_oStringUtils.MyConcat("Dipendenze npm mancanti: ", oYoutubeDl.sError, ". Esegui npm.cmd install."));
      bProceed = false;
    }
  }

  if (bProceed) {
    oSystemResult = await _oSystemCheck.MyCheckSystem("ffmpeg", "ffprobe");
    for (sMode of oSystemResult.aErrors) {
      _oLogger.MyError(sMode);
    }
    if (!oSystemResult.bOk) {
      bProceed = false;
    }
  }

  if (bProceed) {
    oDownloader = new _oDownloaderModule.MyDownloader({
      oYtDlp: oYoutubeDl.oYoutubeDl,
      oConfig: oConfigResult.oConfig,
      oPaths: oDirectoryResult.oPaths,
      oHistory: oHistory
    });
    oSignalHandler = oDownloader.MyHandleInterrupt.bind(oDownloader);
    process.once("SIGINT", oSignalHandler);
    _oLogger.MyInfo("UTubeConverterMusic");
    _oLogger.MyInfo(_oStringUtils.MyConcat("Cartella: ", oConfigResult.oConfig.outputDirectory));

    if (oArguments.sFilePath.length > 0) {
      oRunResult = await MyRunUrlFile(oArguments.sFilePath, oDownloader, oArguments.bForce, oConfigResult.oConfig.outputDirectory);
      iExitCode = oRunResult.bOk ? 0 : 1;
    } else if (oArguments.sUrl.length > 0) {
      if (oArguments.bSingle) {
        sMode = "single";
      } else if (oArguments.bPlaylist) {
        sMode = "playlist";
      } else {
        sMode = "auto";
      }
      oRunResult = await MyRunUrlList([oArguments.sUrl], oDownloader, oArguments.bForce, sMode, oConfigResult.oConfig.outputDirectory);
      iExitCode = oRunResult.bOk ? 0 : 1;
    } else {
      oOperation = await MyRunInteractive(oDownloader, oConfigResult.oConfig.outputDirectory);
      iExitCode = oOperation.bOk ? 0 : 1;
    }

    process.removeListener("SIGINT", oSignalHandler);
    if (oDownloader._bInterrupted) {
      iExitCode = 130;
    }
  }

  return iExitCode;
}

MyMain(process.argv.slice(2))
  .then((iExitCode) => {
    process.exitCode = iExitCode;
  })
  .catch((oError) => {
    _oLogger.MyError(oError.message);
    process.exitCode = 1;
  });
