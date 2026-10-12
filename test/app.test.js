"use strict";

const _oAssert = require("node:assert/strict");
const _oFs = require("node:fs");
const _oOs = require("node:os");
const _oPath = require("node:path");
const _oPassThrough = require("node:stream").PassThrough;
const _oTest = require("node:test");
const _oConfigModule = require("../src/config");
const _oDownloadHistoryModule = require("../src/downloadHistory");
const _oDownloaderModule = require("../src/downloader");
const _oFileManager = require("../src/fileManager");
const _oFilename = require("../src/utils/filename");
const _oPlaylistManagerModule = require("../src/playlistManager");
const _oUrlManager = require("../src/urlManager");

async function MyCreateTestDirectory() {
  // Crea una directory isolata per le prove filesystem.
  let sPath = await _oFs.promises.mkdtemp(_oPath.join(_oOs.tmpdir(), "utube-converter-test-"));

  return sPath;
}

async function MyTestConfigurationLoading() {
  // Verifica merge dei default e validazione dei valori personalizzati.
  let sDirectory = await MyCreateTestDirectory();
  let sConfigPath = _oPath.join(sDirectory, "config.json");
  let oLoadResult = null;
  let sConfigText = "";

  try {
    await _oFs.promises.writeFile(sConfigPath, JSON.stringify({ outputDirectory: _oPath.join(sDirectory, "music"), audioBitrate: "256K" }), "utf8");
    oLoadResult = await _oConfigModule.MyLoadConfig(sConfigPath);
    _oAssert.equal(oLoadResult.bOk, true);
    _oAssert.equal(oLoadResult.oConfig.audioBitrate, "256K");
    _oAssert.equal(oLoadResult.oConfig.maxRetries, 3);
    _oAssert.equal(oLoadResult.oConfig.skipExisting, true);

    sConfigText = await _oFs.promises.readFile(sConfigPath, "utf8");
    _oAssert.match(sConfigText, /256K/);
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

async function MyTestDirectoryCreation() {
  // Verifica che la destinazione e le sottocartelle applicative siano create.
  let sDirectory = await MyCreateTestDirectory();
  let sOutputDirectory = _oPath.join(sDirectory, "music");
  let oResult = null;

  try {
    oResult = await _oFileManager.MyEnsureApplicationDirectories(sOutputDirectory);
    _oAssert.equal(oResult.bOk, true);
    _oAssert.equal(_oFs.existsSync(oResult.oPaths.sMetadataDirectory), true);
    _oAssert.equal(_oFs.existsSync(oResult.oPaths.sTempDirectory), true);
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

function MyTestUrlValidation() {
  // Accetta YouTube HTTPS e rifiuta schemi o host esterni.
  let oValid = _oUrlManager.MyValidateYoutubeUrl("https://music.youtube.com/watch?v=abc123");
  let oInvalidScheme = _oUrlManager.MyValidateYoutubeUrl("http://www.youtube.com/watch?v=abc123");
  let oInvalidHost = _oUrlManager.MyValidateYoutubeUrl("https://example.com/watch?v=abc123");

  _oAssert.equal(oValid.bOk, true);
  _oAssert.equal(oInvalidScheme.bOk, false);
  _oAssert.equal(oInvalidHost.bOk, false);
  _oAssert.equal(_oUrlManager.MyIsPlaylistUrl(new URL("https://www.youtube.com/playlist?list=PL123")), true);
  _oAssert.equal(_oUrlManager.MyIsPlaylistUrl(new URL("https://www.youtube.com/watch?v=abc&list=PL123")), false);

  return null;
}

function MyTestWindowsFilenameHandling() {
  // Pulisce caratteri Windows vietati e conserva Unicode.
  let sSanitized = _oFilename.MySanitizeFilename("日本語/A:B? ");
  let sReserved = _oFilename.MySanitizeFilename("CON");
  let sFilename = _oFilename.MyBuildFilename({ artist: "Nome Artista", track: "曲", title: "Titolo originale" });

  _oAssert.equal(sSanitized, "日本語_A_B_");
  _oAssert.equal(sReserved, "_CON");
  _oAssert.equal(sFilename, "Nome Artista - 曲.mp3");
  _oAssert.equal(_oFilename.MyBuildFilename({ title: "Titolo originale" }), "Titolo originale.mp3");

  return null;
}

async function MyTestHistoryTracking() {
  // Scrive, rilegge e rimuove una voce di storico.
  let sDirectory = await MyCreateTestDirectory();
  let sHistoryPath = _oPath.join(sDirectory, "history.json");
  let oHistory = new _oDownloadHistoryModule.MyDownloadHistory(sHistoryPath);
  let oLoadResult = null;
  let oSaveResult = null;

  try {
    oLoadResult = await oHistory.MyLoad();
    _oAssert.equal(oLoadResult.bOk, true);
    oSaveResult = await oHistory.MySaveEntry("youtube:video-1", { filePath: _oPath.join(sDirectory, "song.mp3"), sourceId: "video-1" });
    _oAssert.equal(oSaveResult.bOk, true);
    _oAssert.equal(oHistory.MyGetEntry("youtube:video-1").sourceId, "video-1");
    oSaveResult = await oHistory.MySaveEntry("youtube:video-1", {
      filePath: _oPath.join(sDirectory, "song-2.mp3"),
      sourceId: "video-1",
      title: "Aggiornato"
    });
    _oAssert.equal(oSaveResult.bOk, true);
    _oAssert.equal(oHistory.MyGetEntry("youtube:video-1").title, "Aggiornato");
    oSaveResult = await oHistory.MyRemoveEntry("youtube:video-1");
    _oAssert.equal(oSaveResult.bOk, true);
    _oAssert.equal(oHistory.MyGetEntry("youtube:video-1"), null);
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

async function MyTestUrlTextImport() {
  // Legge URL da file, ignorando commenti e righe vuote.
  let sDirectory = await MyCreateTestDirectory();
  let sFilePath = _oPath.join(sDirectory, "url.txt");
  let oResult = null;

  try {
    await _oFs.promises.writeFile(
      sFilePath,
      "# Playlist personale\r\nhttps://www.youtube.com/watch?v=one\r\n\r\n https://youtu.be/two \r\n",
      "utf8"
    );
    oResult = await _oFileManager.MyReadUrlFile(sFilePath);
    _oAssert.equal(oResult.bOk, true);
    _oAssert.deepEqual(oResult.aUrls, [
      "https://www.youtube.com/watch?v=one",
      "https://youtu.be/two"
    ]);
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

function MyTestYtDlpOptionsAndQueueDeduplication() {
  // Controlla le opzioni audio e deduplica ID ripetuti nella playlist.
  let oPlaylistManager = new _oPlaylistManagerModule.MyPlaylistManager({
    oYtDlp: {},
    oConfig: { maxRetries: 0, retryDelayMs: 0, timeoutMs: 30000 }
  });
  let oDownloader = new _oDownloaderModule.MyDownloader({
    oYtDlp: {},
    oConfig: { audioFormat: "mp3", audioBitrate: "192K", maxRetries: 3, retryDelayMs: 0, timeoutMs: 30000 },
    oPaths: { sOutputDirectory: "C:\\UTubeConverterMusic" },
    oHistory: {}
  });
  let oOptions = oDownloader.MyBuildDownloadOptions("C:\\temp\\job");
  let oQueue = oPlaylistManager.MyBuildPlaylistQueue({
    entries: [
      { id: "one", title: "Brano", webpage_url: "https://www.youtube.com/watch?v=one" },
      { id: "one", title: "Brano duplicato", webpage_url: "https://www.youtube.com/watch?v=one" },
      { id: "two", title: "Altro", webpage_url: "https://music.youtube.com/watch?v=two" }
    ]
  }, "https://www.youtube.com/playlist?list=PL123");

  _oAssert.equal(oOptions.extractAudio, true);
  _oAssert.equal(oOptions.audioFormat, "mp3");
  _oAssert.equal(oOptions.audioQuality, "192K");
  _oAssert.equal(oOptions.noPlaylist, true);
  _oAssert.equal(oQueue.bOk, true);
  _oAssert.equal(oQueue.aItems.length, 2);

  return null;
}

async function MyTestNoOverwriteOnCollision() {
  // Verifica che un MP3 presente resti intatto e riceva un nome alternativo.
  let sDirectory = await MyCreateTestDirectory();
  let sOutputDirectory = _oPath.join(sDirectory, "music");
  let sSourcePath = _oPath.join(sDirectory, "download.mp3");
  let sExistingPath = _oPath.join(sOutputDirectory, "Brano.mp3");
  let oDownloader = null;
  let oCopyResult = null;
  let sExistingContent = "";
  let sNewContent = "";

  try {
    await _oFs.promises.mkdir(sOutputDirectory, { recursive: true });
    await _oFs.promises.writeFile(sSourcePath, "nuovo", "utf8");
    await _oFs.promises.writeFile(sExistingPath, "esistente", "utf8");
    oDownloader = new _oDownloaderModule.MyDownloader({
      oYtDlp: {},
      oConfig: {},
      oPaths: { sOutputDirectory: sOutputDirectory },
      oHistory: {}
    });
    oCopyResult = await oDownloader.MyCopyToUniquePath(sSourcePath, "Brano.mp3");
    sExistingContent = await _oFs.promises.readFile(sExistingPath, "utf8");
    sNewContent = await _oFs.promises.readFile(oCopyResult.sPath, "utf8");

    _oAssert.equal(oCopyResult.bOk, true);
    _oAssert.equal(_oPath.basename(oCopyResult.sPath), "Brano (2).mp3");
    _oAssert.equal(sExistingContent, "esistente");
    _oAssert.equal(sNewContent, "nuovo");
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

function MyCreateFailedProcess() {
  // Simula un processo yt-dlp che termina con un errore.
  let oProcess = null;
  let oStdout = new _oPassThrough();
  let oStderr = new _oPassThrough();

  oProcess = new Promise((oResolve, oReject) => {
    setImmediate(() => {
      oStderr.write("ERROR: errore simulato\n");
      oStdout.end();
      oStderr.end();
      oProcess.exitCode = 1;
      oReject(Object.assign(new Error("errore simulato"), { stderr: "ERROR: errore simulato" }));
    });
  });
  oProcess.stdout = oStdout;
  oProcess.stderr = oStderr;
  oProcess.exitCode = null;
  oProcess.kill = () => true;

  return oProcess;
}

async function MyTestFailedDownloadHandling() {
  // Verifica che un download fallito sia segnalato e i temporanei rimossi.
  let sDirectory = await MyCreateTestDirectory();
  let oDirectories = await _oFileManager.MyEnsureApplicationDirectories(_oPath.join(sDirectory, "music"));
  let iCallCount = 0;
  let oDownloader = null;
  let oResult = null;
  let aRemainingFiles = [];

  try {
    oDownloader = new _oDownloaderModule.MyDownloader({
      oYtDlp: {
        exec: () => {
          iCallCount += 1;
          return MyCreateFailedProcess();
        }
      },
      oConfig: {
        audioFormat: "mp3",
        audioBitrate: "192K",
        skipExisting: true,
        maxRetries: 0,
        retryDelayMs: 0,
        timeoutMs: 30000
      },
      oPaths: oDirectories.oPaths,
      oHistory: {
        MyGetEntry: () => null
      }
    });

    oResult = await oDownloader.MyDownloadItem({
      sUrl: "https://www.youtube.com/watch?v=failed",
      sSourceKey: "youtube:failed",
      oMetadata: { id: "failed", title: "Errore simulato" }
    }, false);
    aRemainingFiles = await _oFs.promises.readdir(oDirectories.oPaths.sTempDirectory);

    _oAssert.equal(oResult.sStatus, "failed");
    _oAssert.equal(iCallCount, 1);
    _oAssert.equal(aRemainingFiles.length, 0);
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

async function MyTestMissingHistoricalFileIsRetried() {
  // Elimina dallo storico un file mancante e tenta di scaricarlo di nuovo.
  let sDirectory = await MyCreateTestDirectory();
  let oDirectories = await _oFileManager.MyEnsureApplicationDirectories(_oPath.join(sDirectory, "music"));
  let iCallCount = 0;
  let iRemoveCount = 0;
  let oDownloader = null;
  let oResult = null;

  try {
    oDownloader = new _oDownloaderModule.MyDownloader({
      oYtDlp: {
        exec: () => {
          iCallCount += 1;
          return MyCreateFailedProcess();
        }
      },
      oConfig: {
        audioFormat: "mp3",
        audioBitrate: "192K",
        skipExisting: true,
        maxRetries: 0,
        retryDelayMs: 0,
        timeoutMs: 30000
      },
      oPaths: oDirectories.oPaths,
      oHistory: {
        MyGetEntry: () => ({ filePath: _oPath.join(sDirectory, "spostato.mp3") }),
        MyRemoveEntry: async () => {
          iRemoveCount += 1;
          return { bOk: true };
        }
      }
    });

    oResult = await oDownloader.MyDownloadItem({
      sUrl: "https://www.youtube.com/watch?v=missing",
      sSourceKey: "youtube:missing",
      oMetadata: { id: "missing", title: "File spostato" }
    }, false);

    _oAssert.equal(oResult.sStatus, "failed");
    _oAssert.equal(iRemoveCount, 1);
    _oAssert.equal(iCallCount, 1);
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

async function MyTestExistingHistoricalFileIsSkipped() {
  // Salta un elemento registrato quando il relativo MP3 è ancora presente.
  let sDirectory = await MyCreateTestDirectory();
  let oDirectories = await _oFileManager.MyEnsureApplicationDirectories(_oPath.join(sDirectory, "music"));
  let sExistingPath = _oPath.join(oDirectories.oPaths.sOutputDirectory, "Presente.mp3");
  let iCallCount = 0;
  let oDownloader = null;
  let oResult = null;

  try {
    await _oFs.promises.writeFile(sExistingPath, "audio presente", "utf8");
    oDownloader = new _oDownloaderModule.MyDownloader({
      oYtDlp: {
        exec: () => {
          iCallCount += 1;
          return MyCreateFailedProcess();
        }
      },
      oConfig: {
        audioFormat: "mp3",
        audioBitrate: "192K",
        skipExisting: true,
        maxRetries: 0,
        retryDelayMs: 0,
        timeoutMs: 30000
      },
      oPaths: oDirectories.oPaths,
      oHistory: {
        MyGetEntry: () => ({ filePath: sExistingPath })
      }
    });
    oResult = await oDownloader.MyDownloadItem({
      sUrl: "https://www.youtube.com/watch?v=present",
      sSourceKey: "youtube:present",
      oMetadata: { id: "present", title: "Presente" }
    }, false);

    _oAssert.equal(oResult.sStatus, "skipped");
    _oAssert.equal(iCallCount, 0);
  } finally {
    await _oFs.promises.rm(sDirectory, { recursive: true, force: true });
  }

  return null;
}

_oTest("Caricamento e validazione configurazione", MyTestConfigurationLoading);
_oTest("Creazione directory applicative", MyTestDirectoryCreation);
_oTest("Validazione URL YouTube", MyTestUrlValidation);
_oTest("Nomi file Windows e Unicode", MyTestWindowsFilenameHandling);
_oTest("Storico download", MyTestHistoryTracking);
_oTest("Importazione file TXT", MyTestUrlTextImport);
_oTest("Opzioni yt-dlp e deduplicazione playlist", MyTestYtDlpOptionsAndQueueDeduplication);
_oTest("Nessuna sovrascrittura dei file esistenti", MyTestNoOverwriteOnCollision);
_oTest("Gestione errore download e pulizia", MyTestFailedDownloadHandling);
_oTest("Riscaricamento dopo rimozione file dallo storico", MyTestMissingHistoricalFileIsRetried);
_oTest("Salto file già presente nello storico", MyTestExistingHistoricalFileIsSkipped);
