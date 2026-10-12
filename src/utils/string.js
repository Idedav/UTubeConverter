"use strict";

function MyConcat(...aValues) {
  // Concatena valori usando il metodo nativo String.prototype.concat.
  let sResult = "";
  let oValue = "";

  for (oValue of aValues) {
    sResult = sResult.concat(String(oValue));
  }

  return sResult;
}

module.exports = {
  MyConcat: MyConcat
};
