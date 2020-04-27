import Vue from 'vue';
import queryString from 'querystring';
import promisify from 'util.promisify';
import pako from 'pako';
import * as xml2js from 'isomorphic-xml2js';
import { SolapiError } from '../../lib/solapi.js';

const parseString = promisify(xml2js.parseString);

async function __post (state, reqDef) {
  let response;

  try {
    response = await fetch(state.serverPrefix + reqDef.url, {
      method: "POST",
      body: queryString.stringify(reqDef.params),
    });
  } catch(err) {
    throw new SolapiError('network', err.message);
  }

  if (response.status !== 200) {
    throw new SolapiError('statuscode', "Invalid API call");
  }

  let data;
  try {
    data = await response.text();
  } catch(err) {
    throw new SolapiError('network', err.message);
  }

  if (data === 'OK') {
    return Promise.resolve();
  } else if (typeof reqDef.dataField !== 'undefined') {
    let result = null;
    try {
      result = await parseString(data, {explicitArray: reqDef.useArrays});
    } catch(err) {
      throw new SolapiError('response', err.message);
    }
    if (!(result.hasOwnProperty(reqDef.dataField))) {
      throw new SolapiError('response', "Response missing datafield: " + reqDef.dataField);
    }
    return result[reqDef.dataField];
  }
}

const WEIGHT = 1.0/32;

function statsUpdate(stats, newValue) {
  if (newValue === null) {
    return;
  }
  if (stats.max < newValue) {
    stats.max = newValue;
  }
  if (stats.avg !== null) {
    stats.avg = stats.avg * (1 - WEIGHT) + newValue * WEIGHT;
  } else {
    stats.avg = newValue;
  }
  if (typeof stats.sum !== 'undefined') {
    stats.sum += newValue;
  }
}

function abortGet(dispatch, controller, reqDef) {
  controller.abort();
  dispatch('diagnostics/add', 'net: aborted API get ' + reqDef.apiCall,
           {root: true});
}

function calcTimeout(apiStat) {
  return Math.min(Math.max(Math.min(apiStat.avg * 8,
                                    apiStat.max * 2),
                           15000),
                  120000);
}

export default {
  namespaced: true,

  state: {
    // eslint-disable-next-line
    serverPrefix: process.env.VUE_APP_API_URL,
    apiLocks: new Set(),
    apiLocksStamp: 0,	/* Set is not reactive, dummy dep this */
    apiCallStats: {},
    activeApiCalls: {},
    activeApiCallId: -1,
    pastApiCalls: [],
    errorLog: [],
  },

  mutations: {
    lock(state, apiCall) {
      state.apiLocks.add(apiCall);
      state.apiLocksStamp++;
    },
    unlock(state, apiCall) {
      state.apiLocks.delete(apiCall);
      state.apiLocksStamp++;
    },

    start(state, apiCall) {
      state.activeApiCallId++;
      const now = performance.now();

      Vue.set(state.activeApiCalls, '' + state.activeApiCallId, {
        id: '' + state.activeApiCallId,
        apiCall: apiCall,
        startTime: now,
        lastUpdate: now,
        firstByteDelay: null,
        readDelayMax: null,
        received: 0,
        len: null,
      });

      if (typeof state.apiCallStats[apiCall] === 'undefined') {
        Vue.set(state.apiCallStats, apiCall, {
          apiCall: apiCall,
          count: 1,
          errors: 0,
          errorLog: [],
          firstByteDelay: {
            max: 0,
            avg: null,
          },
          readDelay: {
            max: 0,
            avg: null,
          },
          size: {
            max: 0,
            avg: null,
            sum: 0,
          },
          duration: {
            max: 0,
            avg: null,
            sum: 0,
          },
        });
      } else {
        state.apiCallStats[apiCall].count++;
      }
    },
    update(state, apiCallUpdate) {
      let item = state.activeApiCalls[apiCallUpdate.id];
      let statsItem = state.apiCallStats[item.apiCall];
      const now = performance.now();
      const readDelay = now - item.lastUpdate;

      item.received = apiCallUpdate.received;
      item.lastUpdate = now;
      if (item.firstByteDelay === null) {
        item.firstByteDelay = readDelay;
        item.len = apiCallUpdate.len;
        statsUpdate(statsItem.firstByteDelay, readDelay);
      } else if ((readDelay === null) || (readDelay > item.readDelayMax)) {
        item.readDelayMax = readDelay;
        statsUpdate(statsItem.readDelay, readDelay);
      }
    },
    complete(state, completeData) {
      let item = state.activeApiCalls[completeData.id];
      item.status = completeData.status;
      item.duration = performance.now() - item.startTime;

      state.pastApiCalls.unshift(item);
      if (state.pastApiCalls.length > 20) {
        state.pastApiCalls.pop();
      }
      delete state.activeApiCalls[completeData.id];

      let statsItem = state.apiCallStats[item.apiCall];
      statsUpdate(statsItem.duration, item.duration);
      statsUpdate(statsItem.size, item.received);
    },

    logError (state, errorInfo) {
      const apiCall = errorInfo.request.apiCall;
      state.apiCallStats[apiCall].errors++;
      state.apiCallStats[apiCall].errorLog.push(errorInfo.error);
      if (!(errorInfo.error instanceof SolapiError)) {
        console.log(errorInfo.error.message);
        console.log(errorInfo.error.stack);
      }
    },
  },
  getters: {
    isLocked: (state) => (apiCall) => {
      return state.apiLocks.has(apiCall);
    },
    isProductionServer: (state) => {
      return state.serverPrefix === '';
    },
  },

  actions: {
    async get ({state, commit, dispatch}, reqDef) {
      /* Due to dev CORS reasons, we need to mangle some API provided URLs */
      let url = reqDef.url.replace(/^http:\/\/sailonline.org\//, '/');
      const params = queryString.stringify(reqDef.params);
      if (params.length > 0) {
        url += '?' + params;
      }

      commit('start', reqDef.apiCall);
      const apiStats = state.apiCallStats[reqDef.apiCall];
      const apiCallUpdate = {
        id: state.activeApiCallId,
        len: null,
        received: 0,
      }

      const controller = new AbortController();
      const signal = controller.signal;
      let timer = null;

      let data;
      try {
        let response;
        timer = setTimeout(abortGet, calcTimeout(apiStats.firstByteDelay),
                           dispatch, controller, reqDef);
        try {
          response = await fetch(state.serverPrefix + url, {signal});
        } catch(err) {
          throw new SolapiError('network', err.message);
        }

        if (response.status !== 200) {
          throw new SolapiError('statuscode', "Invalid API call");
        }

        const len = response.headers.get('Content-Length');
        if (len === 0) {
          throw new SolapiError('response', "Empty response");
        }
        apiCallUpdate.len = len;

        const compressedPayload = (typeof reqDef.compressedPayload !== 'undefined');
        let builder;
        if (compressedPayload) {
          builder = new pako.Inflate();
        } else {
          builder = [];
        }
        let r;
        try {
          r = response.body.getReader();
        } catch(err) {
          throw new SolapiError('network', err.message);
        }

        while (true) {
          let read;
          try {
            read = await r.read();
          } catch(err) {
            throw new SolapiError('network', err.message);
          }

          clearTimeout(timer);
          timer = null;

          if (read.done) {
            break;
          }
          builder.push(read.value);
          if (compressedPayload && (builder.err !== 0)) {
            throw new SolapiError('parsing', "Decompress fails!");
          }
          apiCallUpdate.received += read.value.length;
          commit('update', apiCallUpdate);
          timer = setTimeout(abortGet, calcTimeout(apiStats.readDelay),
                             dispatch, controller, reqDef);
        }

        if (compressedPayload) {
          if (typeof builder.result === 'undefined') {
            throw new SolapiError('parsing', "Decompress incomplete!");
          }
          data = builder.result;
        } else {
          data = new Uint8Array(apiCallUpdate.received);
          let at = 0;
          for (let chunk of builder) {
            data.set(chunk, at);
            at += chunk.length;
          }
        }

        try {
          data = new TextDecoder('utf-8').decode(data);
        } catch(err) {
          throw new SolapiError('parsing', "UTF-8 decode fails");
        }
        commit('complete', {
          id: apiCallUpdate.id,
          status: 'OK',
        });
      } catch (err) {
        commit('complete', {
          id: apiCallUpdate.id,
          status: 'ERROR',
          error: err,
        });
        if (timer !== null) {
          clearTimeout(timer);
        }
        throw err;
      }

      let result;
      try {
        result = await parseString(data, {explicitArray: reqDef.useArrays});
      } catch(err) {
        throw new SolapiError('parsing', err.message);
      }

      if (!(result.hasOwnProperty(reqDef.dataField))) {
        throw new SolapiError('response', "Response missing datafield: " + reqDef.dataField);
      }

      return result[reqDef.dataField];
    },


    async post ({state, commit}, reqDef) {
      let res;
      try {
        res = await __post(state, reqDef)
      } catch(err) {
        commit('logError', {
          request: reqDef,
          error: err,
        });
        throw err;
      }

      return res;
    },
  },
}
