"use strict";

const _oStringUtils = require("./utils/string");

function MyInfo(sMessage) {
  // Mostra un messaggio informativo nel terminale.
  console.log(sMessage);

  return null;
}

function MyWarning(sMessage) {
  // Mostra un avviso senza interrompere l'operazione.
  console.warn(_oStringUtils.MyConcat("Avviso: ", sMessage));

  return null;
}

function MyError(sMessage) {
  // Mostra un errore leggibile nel terminale.
  console.error(_oStringUtils.MyConcat("Errore: ", sMessage));

  return null;
}

module.exports = {
  MyInfo: MyInfo,
  MyWarning: MyWarning,
  MyError: MyError
};
