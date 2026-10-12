"use strict";

const _oFs = require("node:fs");
const _oPath = require("node:path");
const _oFileManager = require("./fileManager");
const _oAudioConverter = require("./audioConverter");
const _oFilename = require("./utils/filename");
const _oLogger = require("./logger");
const _oPlaylistManagerModule = require("./playlistManager");
const _oStringUtils = require("./utils/string");

class MyDownloader {
  // Coordina download, conversione, deduplicazione e storico.
  constructor(oOptions) {
    // Conserva le dipendenze e installa l'interruzione controllata.
    this._oYtDlp = oOptions.oYtDlp;
    this._oConfig = oOptions.oConfig;
    this._oPaths = oOptions.oPaths;
    this._oHistory = oOptions.oHistory;
    this._oPlaylistManager = oOptions.oPlaylistManager || new _oPlaylistManagerModule.MyPlaylistManager({
      oYtDlp: this._oYtDlp,
      oConfig: this._oConfig
    });
    this._sFfprobeCommand = oOptions.sFfprobeCommand || "ffprobe";
    this._bInterrupted = false;
    this._oActiveProcess = null;
    this._sProgressBuffer = "";
  }

  MyHandleInterrupt() {
    // Ferma il processo corrente quando l'utente preme Ctrl+C.
    this._bInterrupted = true;
    this._oPlaylistManager.MyHandleInterrupt();
    if ((this._oActiveProcess !== null) && (typeof this._oActiveProcess.kill === "function")) {
      try {
        this._oActiveProcess.kill("SIGINT");
      } catch (oError) {
        _oLogger.MyWarning(_oStringUtils.MyConcat("Interruzione del download non riuscita: ", oError.message));
      }
    }

    return null;
  }

  MyHandleProgressChunk(oChunk) {
    // Estrae e mostra solo le percentuali effettivamente emesse da yt-dlp.
    let aLines = [];
    let sLine = "";
    let aMatches = [];
    let sPercent = "";

    this._sProgressBuffer = _oStringUtils.MyConcat(this._sProgressBuffer, oChunk.toString());
    aLines = this._sProgressBuffer.split(/\r?\n/);
    this._sProgressBuffer = aLines.pop() || "";

    for (sLine of aLines) {
      aMatches = sLine.match(/\d{1,3}(?:\.\d+)?%/g) || [];
      if (aMatches.length > 0) {
        sPercent = aMatches[aMatches.length - 1];
        _oLogger.MyInfo(_oStringUtils.MyConcat("Avanzamento download: ", sPercent));
      } else if (/\b(error|warning)\b/i.test(sLine)) {
        _oLogger.MyWarning(sLine.trim());
      }
    }

    return null;
  }

  MyBuildDownloadOptions(sTempPath) {
    // Costruisce esclusivamente opzioni supportate da yt-dlp.
    let oOptions = {
      format: "bestaudio/best",
      extractAudio: true,
      audioFormat: this._oConfig.audioFormat,
      audioQuality: this._oConfig.audioBitrate,
      output: "source.%(ext)s",
      paths: sTempPath,
      noPlaylist: true,
      noWarnings: true,
      noCallHome: true,
      noOverwrites: true,
      newline: true,
      progress: true,
      progressTemplate: "download:%(progress._percent_str)s",
      writeInfoJson: true,
      noWritePlaylistMetafiles: true,
      embedMetadata: true,
      retries: 1,
      fragmentRetries: 1,
      extractorRetries: 1
    };

    return oOptions;
  }

  async MyRunYtDlp(sUrl, oOptions) {
    // Avvia yt-dlp e acquisisce avanzamento ed errori del processo.
    let oResult = { bOk: false, sOutput: "", sError: "" };
    let oProcess = null;
    let oProcessDetails = null;
    let sProcessOutput = "";
    let bProcessResolved = false;

    try {
      oProcess = this._oYtDlp.exec(sUrl, oOptions, {
        timeout: this._oConfig.timeoutMs,
        windowsHide: true
      });
      this._oActiveProcess = oProcess;
      this._sProgressBuffer = "";
      oProcess.stdout.on("data", (oChunk) => {
        sProcessOutput = _oStringUtils.MyConcat(sProcessOutput, oChunk.toString());
      });
      oProcess.stderr.on("data", (oChunk) => {
        sProcessOutput = _oStringUtils.MyConcat(sProcessOutput, oChunk.toString());
        this.MyHandleProgressChunk(oChunk);
      });
      oProcessDetails = await oProcess;
      bProcessResolved = true;
      oResult.bOk = (oProcessDetails.exitCode === 0) ||
        (oProcess.exitCode === 0) ||
        ((oProcessDetails.exitCode === null) && (oProcess.exitCode === null));
      if (!oResult.bOk) {
        oResult.sError = _oStringUtils.MyConcat("yt-dlp è terminato con codice ", oProcessDetails.exitCode, ".");
      }
    } catch (oError) {
      oResult.sError = oError.stderr
        ? _oStringUtils.MyConcat(String(oError.stderr).trim(), " ", oError.message)
        : oError.message;
    }

    this._oActiveProcess = null;
    oResult.sOutput = sProcessOutput;
    if (!bProcessResolved && (oResult.sError.length === 0)) {
      oResult.sError = "Il processo yt-dlp non è terminato correttamente.";
    }

    return oResult;
  }

  async MyCopyToUniquePath(sSourcePath, sDesiredFilename) {
    // Copia il file finale senza sovrascrivere eventuali file esistenti.
    let oResult = { bOk: false, sPath: "", sError: "" };
    let sBaseName = _oPath.parse(sDesiredFilename).name;
    let sExtension = _oPath.extname(sDesiredFilename);
    let sCandidatePath = "";
    let iAttempt = 0;
    let bProceed = true;

    while ((iAttempt < 1000) && !oResult.bOk && bProceed) {
      sCandidatePath = _oPath.join(
        this._oPaths.sOutputDirectory,
        (iAttempt === 0)
          ? sDesiredFilename
          : _oStringUtils.MyConcat(sBaseName, " (", iAttempt + 1, ")", sExtension)
      );
      try {
        await _oFs.promises.copyFile(sSourcePath, sCandidatePath, _oFs.constants.COPYFILE_EXCL);
        oResult.bOk = true;
        oResult.sPath = sCandidatePath;
      } catch (oError) {
        if (oError.code === "EEXIST") {
          iAttempt += 1;
        } else {
          bProceed = false;
          oResult.sError = _oStringUtils.MyConcat("Impossibile salvare il file MP3: ", oError.message);
        }
      }
    }

    if (!oResult.bOk && (oResult.sError.length === 0)) {
      oResult.sError = "Non è stato possibile trovare un nome file libero.";
    }

    return oResult;
  }

  async MyStoreMetadata(oItem, sFinalPath, sSourceKey) {
    // Conserva l'ID sorgente nei metadati locali e nello storico.
    let oResult = { bOk: true, aWarnings: [] };
    let tCompletedAt = new Date().toISOString();
    let sMetadataFilename = _oStringUtils.MyConcat(_oFilename.MySanitizeFilename(sSourceKey), ".json");
    let sMetadataPath = _oPath.join(this._oPaths.sMetadataDirectory, sMetadataFilename);
    let oMetadataRecord = {
      sourceId: String(oItem.oMetadata.id || ""),
      sourceKey: sSourceKey,
      sourceUrl: oItem.sUrl,
      title: String(oItem.oMetadata.title || ""),
      artist: String(oItem.oMetadata.artist || ""),
      track: String(oItem.oMetadata.track || ""),
      finalFile: sFinalPath,
      completedAt: tCompletedAt,
      audioFormat: this._oConfig.audioFormat,
      audioBitrate: this._oConfig.audioBitrate
    };
    let oMetadataWrite = null;
    let oHistoryWrite = null;

    oMetadataWrite = await _oFileManager.MyWriteJson(sMetadataPath, oMetadataRecord);
    if (!oMetadataWrite.bOk) {
      oResult.aWarnings.push(_oStringUtils.MyConcat("Metadati locali non salvati: ", oMetadataWrite.sError));
    }

    oHistoryWrite = await this._oHistory.MySaveEntry(sSourceKey, {
      filePath: sFinalPath,
      sourceId: oMetadataRecord.sourceId,
      sourceUrl: oItem.sUrl,
      title: oMetadataRecord.title,
      completedAt: tCompletedAt
    });
    if (!oHistoryWrite.bOk) {
      oResult.aWarnings.push(_oStringUtils.MyConcat("Storico download non aggiornato: ", oHistoryWrite.sError));
    }

    return oResult;
  }

  async MyDownloadItem(oItem, bForce) {
    // Scarica un singolo elemento, valida l'MP3 e registra il risultato.
    let oResult = { sStatus: "failed", sError: "", sFinalPath: "" };
    let oHistoryEntry = null;
    let bHistoryFileExists = false;
    let sSourceKey = oItem.sSourceKey || this._oPlaylistManager.MyBuildSourceKey(oItem.oMetadata, oItem.sUrl);
    let oTempResult = null;
    let oYtDlpResult = null;
    let aTempFiles = [];
    let sMp3Path = "";
    let oValidation = null;
    let sDesiredFilename = "";
    let oCopyResult = null;
    let oStoredMetadata = null;
    let iAttempt = 0;
    let bCompleted = false;
    let oStats = null;
    let oRemoveHistory = null;

    if (!bForce && this._oConfig.skipExisting) {
      oHistoryEntry = this._oHistory.MyGetEntry(sSourceKey);
      if ((oHistoryEntry !== null) && (typeof oHistoryEntry.filePath === "string")) {
        try {
          oStats = await _oFs.promises.stat(oHistoryEntry.filePath);
          bHistoryFileExists = oStats.isFile();
        } catch (oError) {
          if (oError.code !== "ENOENT") {
            oResult.sError = _oStringUtils.MyConcat("Impossibile verificare il file nello storico: ", oError.message);
          }
        }
        if (bHistoryFileExists) {
          oResult.sStatus = "skipped";
          _oLogger.MyInfo("Stato: già scaricato, salto.");
        } else if (oResult.sError.length === 0) {
          oRemoveHistory = await this._oHistory.MyRemoveEntry(sSourceKey);
          if (!oRemoveHistory.bOk) {
            _oLogger.MyWarning(oRemoveHistory.sError);
          }
        }
      }
    }

    if ((oResult.sStatus !== "skipped") && (oResult.sError.length === 0)) {
      while ((iAttempt <= this._oConfig.maxRetries) && !bCompleted && !this._bInterrupted) {
        iAttempt += 1;
        oTempResult = await _oFileManager.MyCreateTempDirectory(this._oPaths.sTempDirectory);
        if (!oTempResult.bOk) {
          oResult.sError = oTempResult.sError;
        } else {
          oYtDlpResult = await this.MyRunYtDlp(oItem.sUrl, this.MyBuildDownloadOptions(oTempResult.sPath));
          if (oYtDlpResult.bOk) {
            _oLogger.MyInfo("Conversione e verifica MP3...");
            try {
              aTempFiles = await _oFs.promises.readdir(oTempResult.sPath);
              sMp3Path = "";
              for (sDesiredFilename of aTempFiles) {
                if (_oPath.extname(sDesiredFilename).toLowerCase() === ".mp3") {
                  sMp3Path = _oPath.join(oTempResult.sPath, sDesiredFilename);
                }
              }
            } catch (oError) {
              oResult.sError = _oStringUtils.MyConcat("File temporanei non leggibili: ", oError.message);
            }

            if (sMp3Path.length > 0) {
              oValidation = await _oAudioConverter.MyValidateMp3(
                sMp3Path,
                this._sFfprobeCommand,
                this._oConfig.timeoutMs
              );
              if (oValidation.bOk) {
                sDesiredFilename = _oFilename.MyBuildFilename(oItem.oMetadata);
                oCopyResult = await this.MyCopyToUniquePath(sMp3Path, sDesiredFilename);
                if (oCopyResult.bOk) {
                  oResult.sStatus = "downloaded";
                  oResult.sFinalPath = oCopyResult.sPath;
                  oResult.sError = "";
                  oStoredMetadata = await this.MyStoreMetadata(oItem, oCopyResult.sPath, sSourceKey);
                  for (sDesiredFilename of oStoredMetadata.aWarnings) {
                    _oLogger.MyWarning(sDesiredFilename);
                  }
                  bCompleted = true;
                } else {
                  oResult.sError = oCopyResult.sError;
                }
              } else {
                oResult.sError = oValidation.sError;
              }
            } else if (oResult.sError.length === 0) {
              oResult.sError = "yt-dlp non ha prodotto un file MP3.";
            }
          } else {
            oResult.sError = oYtDlpResult.sError;
          }

          oTempResult = await _oFileManager.MyRemoveDirectory(oTempResult.sPath);
          if (!oTempResult.bOk) {
            _oLogger.MyWarning(oTempResult.sError);
          }
        }

        if (!bCompleted && (iAttempt <= this._oConfig.maxRetries) && !this._bInterrupted && (this._oConfig.retryDelayMs > 0)) {
          _oLogger.MyWarning(_oStringUtils.MyConcat("Tentativo ", iAttempt, " non riuscito: ", oResult.sError));
          await new Promise((oResolve) => setTimeout(oResolve, this._oConfig.retryDelayMs));
        }
      }
    }

    if (this._bInterrupted && !bCompleted && (oResult.sStatus !== "skipped")) {
      oResult.sStatus = "failed";
      oResult.sError = "Operazione interrotta dall'utente.";
    } else if (bCompleted) {
      oResult.sStatus = "downloaded";
      _oLogger.MyInfo(_oStringUtils.MyConcat("Stato: completato — ", oResult.sFinalPath));
    } else if (oResult.sStatus !== "skipped") {
      oResult.sStatus = "failed";
      if (oResult.sError.length === 0) {
        oResult.sError = "Download non riuscito dopo i tentativi previsti.";
      }
    }

    return oResult;
  }

  async MyProcessQueue(aItems, bForce) {
    // Elabora gli elementi in sequenza e restituisce un riepilogo.
    let oSummary = { iIdentified: 0, iDownloaded: 0, iSkipped: 0, iFailed: 0, aFailures: [], bInterrupted: false };
    let oSeen = new Set();
    let oItem = null;
    let oItemResult = null;
    let oItemError = null;
    let sSourceKey = "";
    let iIndex = 0;
    let iTotal = 0;

    for (oItem of aItems) {
      sSourceKey = oItem.sSourceKey || this._oPlaylistManager.MyBuildSourceKey(oItem.oMetadata, oItem.sUrl);
      if (!oSeen.has(sSourceKey)) {
        oSeen.add(sSourceKey);
      }
    }

    oSummary.iIdentified = oSeen.size;
    iTotal = oSummary.iIdentified;
    oSeen.clear();
    for (oItem of aItems) {
      if (!this._bInterrupted) {
        sSourceKey = oItem.sSourceKey || this._oPlaylistManager.MyBuildSourceKey(oItem.oMetadata, oItem.sUrl);
        if (!oSeen.has(sSourceKey)) {
          oSeen.add(sSourceKey);
          iIndex += 1;
          _oLogger.MyInfo(_oStringUtils.MyConcat("[", iIndex, "/", iTotal, "] ", oItem.oMetadata.title || oItem.sUrl));
          try {
            oItemResult = await this.MyDownloadItem(oItem, bForce);
          } catch (oError) {
            oItemError = oError;
            oItemResult = { sStatus: "failed", sError: oItemError.message, sFinalPath: "" };
          }
          if (oItemResult.sStatus === "downloaded") {
            oSummary.iDownloaded += 1;
          } else if (oItemResult.sStatus === "skipped") {
            oSummary.iSkipped += 1;
          } else {
            oSummary.iFailed += 1;
            oSummary.aFailures.push({ sTitle: oItem.oMetadata.title || oItem.sUrl, sError: oItemResult.sError });
            _oLogger.MyError(oItemResult.sError);
          }
        }
      }
    }

    oSummary.bInterrupted = this._bInterrupted;
    return oSummary;
  }

  async MyDownloadUrl(sUrl, bPlaylist, bForce) {
    // Risolve un singolo URL o espande una playlist prima della coda.
    let oResult = { bOk: false, sError: "", sPlaylistTitle: "", oSummary: null };
    let oMetadataResult = null;
    let oQueueResult = null;
    let aItems = [];
    let oMetadata = null;
    let sSourceKey = "";

    oMetadataResult = await this._oPlaylistManager.MyGetMetadata(sUrl, bPlaylist);
    if (!oMetadataResult.bOk) {
      oResult.sError = oMetadataResult.sError;
    } else {
      oMetadata = oMetadataResult.oMetadata;
      if (bPlaylist) {
        oResult.sPlaylistTitle = String(oMetadata.title || "Playlist");
        oQueueResult = this._oPlaylistManager.MyBuildPlaylistQueue(oMetadata, sUrl);
        if (oQueueResult.bOk) {
          aItems = oQueueResult.aItems;
          _oLogger.MyInfo(_oStringUtils.MyConcat("Playlist: ", oResult.sPlaylistTitle));
          _oLogger.MyInfo(_oStringUtils.MyConcat("Elementi identificati: ", aItems.length));
        } else {
          oResult.sError = oQueueResult.sError;
        }
      } else {
        sSourceKey = this._oPlaylistManager.MyBuildSourceKey(oMetadata, sUrl);
        aItems.push({ sUrl: sUrl, oMetadata: oMetadata, sSourceKey: sSourceKey });
      }

      if (aItems.length > 0) {
        oResult.oSummary = await this.MyProcessQueue(aItems, bForce);
        oResult.bOk = oResult.oSummary.iFailed === 0;
      }
    }

    return oResult;
  }
}

module.exports = {
  MyDownloader: MyDownloader
};
