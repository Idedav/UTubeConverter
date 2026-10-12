"use strict";

const _oChildProcess = require("node:child_process");
const _oStringUtils = require("./utils/string");

function MyRunProcess(sCommand, aArguments, iTimeoutMs) {
  // Avvia un eseguibile con argomenti separati e un timeout finito.
  let oResult = { bOk: false, iExitCode: null, sStdout: "", sStderr: "", bTimedOut: false };
  let oPromise = null;
  let oProcess = null;
  let oResolvePromise = null;
  let oTimeout = null;
  let oKillTimeout = null;
  let bSettled = false;

  oPromise = new Promise((oResolve) => {
    oResolvePromise = oResolve;
    try {
      oProcess = _oChildProcess.spawn(sCommand, aArguments, { windowsHide: true, shell: false });
      oProcess.stdout.on("data", (oChunk) => {
        oResult.sStdout = _oStringUtils.MyConcat(oResult.sStdout, oChunk.toString());
      });
      oProcess.stderr.on("data", (oChunk) => {
        oResult.sStderr = _oStringUtils.MyConcat(oResult.sStderr, oChunk.toString());
      });
      oProcess.once("error", (oError) => {
        if (!bSettled) {
          bSettled = true;
          oResult.sStderr = _oStringUtils.MyConcat(oResult.sStderr, oError.message);
          clearTimeout(oTimeout);
          clearTimeout(oKillTimeout);
          oResolvePromise(oResult);
        }
      });
      oProcess.once("close", (iExitCode) => {
        if (!bSettled) {
          bSettled = true;
          oResult.iExitCode = iExitCode;
          oResult.bOk = (iExitCode === 0) && !oResult.bTimedOut;
          clearTimeout(oTimeout);
          clearTimeout(oKillTimeout);
          oResolvePromise(oResult);
        }
      });
      oTimeout = setTimeout(() => {
        if (!bSettled) {
          oResult.bTimedOut = true;
          oProcess.kill("SIGTERM");
          oKillTimeout = setTimeout(() => {
            if (!bSettled) {
              oProcess.kill("SIGKILL");
              bSettled = true;
              oResult.sStderr = _oStringUtils.MyConcat(oResult.sStderr, "Processo terminato dopo il timeout.");
              oResolvePromise(oResult);
            }
          }, 5000);
        }
      }, iTimeoutMs);
    } catch (oError) {
      if (!bSettled) {
        bSettled = true;
        oResult.sStderr = _oStringUtils.MyConcat(oResult.sStderr, oError.message);
        clearTimeout(oTimeout);
        clearTimeout(oKillTimeout);
        oResolvePromise(oResult);
      }
    }
  });

  return oPromise;
}

module.exports = {
  MyRunProcess: MyRunProcess
};
