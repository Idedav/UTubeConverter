"use strict";

const _oPath = require("node:path");
const _oStringUtils = require("./string");

function MySanitizeFilename(sName) {
  // Rimuove i caratteri non ammessi da Windows e i nomi di dispositivo riservati.
  let sResult = "";
  let sBaseName = "";

  if (typeof sName === "string") {
    sResult = sName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/[ .]+$/g, "").trim();
  }

  if (sResult.length > 160) {
    sResult = sResult.slice(0, 160).replace(/[ .]+$/g, "");
  }

  sBaseName = _oPath.parse(sResult).name;
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(sBaseName)) {
    sResult = _oStringUtils.MyConcat("_", sResult);
  }

  if ((sResult.length === 0) || (sResult === ".") || (sResult === "..")) {
    sResult = "download";
  }

  return sResult;
}

function MyBuildFilename(oMetadata) {
  // Usa artista e traccia solo quando entrambi sono presenti.
  let sArtist = "";
  let sTrack = "";
  let sTitle = "";
  let sName = "";

  if ((oMetadata !== null) && (typeof oMetadata === "object")) {
    if (typeof oMetadata.artist === "string") {
      sArtist = oMetadata.artist.trim();
    }
    if (typeof oMetadata.track === "string") {
      sTrack = oMetadata.track.trim();
    }
    if (typeof oMetadata.title === "string") {
      sTitle = oMetadata.title.trim();
    }
  }

  if ((sArtist.length > 0) && (sTrack.length > 0)) {
    sName = _oStringUtils.MyConcat(sArtist, " - ", sTrack);
  } else if (sTitle.length > 0) {
    sName = sTitle;
  } else {
    sName = "download";
  }

  return _oStringUtils.MyConcat(MySanitizeFilename(sName), ".mp3");
}

module.exports = {
  MySanitizeFilename: MySanitizeFilename,
  MyBuildFilename: MyBuildFilename
};
