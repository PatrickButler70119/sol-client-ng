import L from 'leaflet';
import { UTCToMsec, hToMsec, secToMsec, interpolateFactor, linearInterpolate, bsearchLeft } from '../../lib/utils.js';
import { UVToWind } from '../../lib/sol.js';
import { configSetValue } from '../../components/config/configstore.js';

function wxLinearInterpolate(factor, startData, endData) {
  return [
    linearInterpolate(factor, startData[0], endData[0]),
    linearInterpolate(factor, startData[1], endData[1]),
  ];
}

function wxTimeInterpolate(factor, startData, endData) {
  const fEnd = -2 * Math.pow(factor, 3) + 3 * Math.pow(factor, 2)
  const fStart = 1 - fEnd;

  return [
    fStart * startData[0] + fEnd * endData[0],
    fStart * startData[1] + fEnd * endData[1],
  ];
}

/* Bounds the given time between wx data range, return null if no bound
 * applies
 */
function boundTime(state, time) {
  if (state.loaded) {
    if (time < state.data.timeSeries[0]) {
      return state.data.timeSeries[0];
    } else if (time > state.data.timeSeries[state.data.timeSeries.length - 1]) {
      return state.data.timeSeries[state.data.timeSeries.length - 1];
    }
  }
  return null;
}

export default {
  namespaced: true,

  state: {
    loaded: false,
    time: 0,
    fetchTime: 0,
    fetchPeriod: {
      hot: {
        minWait: 30,
        variation: 60,
      },
      cold: {
        minWait: 3 * 60,
        variation: 10 * 60,
      },
    },
    updateTimes: [4*60 + 30, 10*60 + 30, 16*60 + 30, 22*60 + 30],
    data: {
      url: null,
      updated: null,
      boundary: null,
      timeSeries: [],
      origo: [],
      increment: [],
      windMap: [],      /* format: [time][lon][lat][u,v] */
    },
    cfg: {
      arrowsBarbs: {
        value: 'arrows',
        type: 'values',
        values: ['arrows', 'barbs'],
        cfgText: 'Wind arrows / barbs',
      },
      sound: {
        value: false,
        type: 'boolean',
        cfgText: 'New weather sound',
      },
      start24h: {
        value: false,
        type: 'boolean',
        cfgText: 'Start with 24h weather',
      },
      gridInterval: {
        value: 48,
        type: 'range',
        low: 24,
        high: 128,
        cfgText: 'Wind grid density',
      },
      twstxt: {
        value: false,
        type: 'boolean',
        cfgText: 'Show wind speed',
      },
      twdtxt: {
        value: false,
        type: 'boolean',
        cfgText: 'Show wind direction',
      },
    },
  },

  mutations: {
    initTime(state, time) {
      state.time = time;
    },
    update(state, weatherData) {
      state.data = weatherData;
      state.loaded = true;
      /* wx begins only after our current timestamp, fix the wx time index
       * to avoid issues
       */
      const boundedTime = boundTime(state, state.time);
      if (boundedTime !== null) {
        console.log("time outside wx, fixing: " + state.time + " vs " + state.data.timeSeries[0] + "-" + state.data.timeSeries[state.data.timeSeries.length - 1]);
        state.time = boundedTime;
      }
    },
    minTime(state, minTime) {
      if (state.loaded) {
        const boundedMinTime = boundTime(state, minTime);
        if (boundedMinTime !== null) {
          minTime = boundedMinTime;
        }
      }
      if (state.time < minTime) {
        state.time = minTime;
      }
    },
    setTime(state, time) {
      if (state.loaded) {
        const boundedTime = boundTime(state, time);
        if (boundedTime !== null) {
          time = boundedTime;
        }
        state.time = time;
      }
    },
    setUpdateTimes(state, updateTimes) {
      state.updateTimes = updateTimes;
    },
    updateFetchTime(state, fetchTime) {
      state.fetchTime = fetchTime;
    },
    configSetValue,
  },

  getters: {
    time: (state) => {
      return state.time;
    },
    lastTimestamp: (state) => {
      return state.data.timeSeries[state.data.timeSeries.length - 1];
    },
    dataTimescale: (state, getters, rootState, rootGetters) => {
      return getters.lastTimestamp - rootGetters['boat/time'];
    },
    timeIndex: (state) => {
      /* Short-circuit for the common case near the beginning of the wx series */
      if (state.time <= state.data.timeSeries[1]) {
        return 0;
      }

      let idx = bsearchLeft(state.data.timeSeries, state.time, 2, state.data.timeSeries.length - 1) - 1;
      /* For now, check that the result is valid, */
      if ((state.data.timeSeries[idx] > state.time) ||
          (state.data.timeSeries[idx+1] < state.time)) {
        console.log("Bug in binary-search: " + state.data.timeSeries[idx] + "<=" + state.time + "<=" + state.data.timeSeries[idx+1] + "?!?");
      }
      return idx;
    },
    timeIndexAny: (state, getters) => (timestamp) => {
      /* Short-circuit for the common case near the beginning of the wx series */
      if (timestamp <= state.data.timeSeries[1]) {
        return 0;
      }

      let min = 2;
      let max = state.data.timeSeries.length - 1;
      if (state.data.timeSeries[getters.timeIndex+1] < timestamp) {
        min = getters.timeIndex + 2;
      } else if (state.data.timeSeries[getters.timeIndex] > timestamp) {
        max = getters.timeIndex;
      }

      let idx = bsearchLeft(state.data.timeSeries, timestamp, min, max) - 1;
      /* For now, check that the result is valid, */
      if ((state.data.timeSeries[idx] > timestamp) ||
          (state.data.timeSeries[idx+1] < timestamp)) {
        console.log("Bug in binary-search: " + state.data.timeSeries[idx] + "<=" + timestamp + "<=" + state.data.timeSeries[idx+1] + "?!?");
      }
      return idx;
    },

    latLngWind: (state, getters) => (latLng, timestamp) => {
      if (state.data.boundary === null) {
        return undefined;
      }
      /* De-wrap if longitude < origo because the wx boundary of the source
       * data is not-wrapped when crossing the anti-meridian
       */
      const wxLatLng = L.latLng(latLng.lat,
                                latLng.lng +
                                (latLng.lng < state.data.origo[1] ? 360 : 0));
      /*
       * .contains() doesn't prevent access to undefined item at race boundary
       * so we have to do the checks manually. Lng is linearized above, thus
       * only >= check is needed for it.
       */
      if ((wxLatLng.lng >= state.data.boundary.getNorthEast().lng) ||
          (wxLatLng.lat < state.data.boundary.getSouthWest().lat) ||
          (wxLatLng.lat >= state.data.boundary.getNorthEast().lat)) {
        return undefined;
      }

      const lonIdx = Math.floor((wxLatLng.lng - state.data.origo[1]) / state.data.increment[1]);
      const latIdx = Math.floor((wxLatLng.lat - state.data.origo[0]) / state.data.increment[0]);
      let timeIdx = getters.timeIndex;
      let timeVal = state.time;

      if (typeof timestamp !== 'undefined') {
        timeVal = timestamp;
        timeIdx = getters['timeIndexAny'](timestamp);
      }

      /* latitude (y) solution */
      let firstRes = [[], []];
      const firstFactor = interpolateFactor(
        latIdx * state.data.increment[0] + state.data.origo[0],
        wxLatLng.lat,
        (latIdx + 1) * state.data.increment[0] + state.data.origo[0]
      );
      for (let t = 0; t <= 1; t++) {
        for (let x = 0; x <= 1; x++) {
          firstRes[t][x] = wxLinearInterpolate(
            firstFactor,
            state.data.windMap[timeIdx+t][lonIdx+x][latIdx],
            state.data.windMap[timeIdx+t][lonIdx+x][latIdx+1]
          );
        }
      }

      /* longitude (x) solution */
      let secondRes = [];
      const secondFactor = interpolateFactor(
        lonIdx * state.data.increment[1] + state.data.origo[1],
        wxLatLng.lng,
        (lonIdx + 1) * state.data.increment[1] + state.data.origo[1]
      );
      for (let t = 0; t <= 1; t++) {
          secondRes[t] = wxLinearInterpolate(
            secondFactor,
            firstRes[t][0],
            firstRes[t][1]
          );
      }

      /* time (z) solution */
      const thirdFactor = interpolateFactor(
        state.data.timeSeries[timeIdx],
        timeVal,
        state.data.timeSeries[timeIdx+1],
      );
      return UVToWind(wxTimeInterpolate(
        thirdFactor,
        secondRes[0],
        secondRes[1]
      ));
    },

    nextTimeToFetch: (state, getters, rootState, rootGetters) => {
      const now = rootGetters['time/now']();
      let fetchPeriod = state.fetchPeriod.cold;

      /* First fetch(es) failed so far, retry soon enough */
      if (state.data.updated === null) {
        fetchPeriod = state.fetchPeriod.hot;

      /* No hot periods within 1h from last wx update */
      } else if (state.data.updated + hToMsec(1) < now) {
        const d = new Date(now);
        const nowMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();

        for (let updateMinutes of state.updateTimes) {
          /* Same formula as in minTurnAngle (now in minutes) */
          const delta = (nowMinutes - updateMinutes + ((24+12)*60)) % (24*60) - (12*60);
          /* Hot period with +/-25 minutes around the given update time.
           * In practice, however, it won't start until the previous cold
           * timer expires (see the values below).
           */
          if (Math.abs(delta) < 25) {
            fetchPeriod = state.fetchPeriod.hot;
            break;
          }
        }
      }

      return state.fetchTime + secToMsec(fetchPeriod.minWait) +
             secToMsec(fetchPeriod.variation) * Math.random();
    },
  },

  actions: {
    // ADDME: when to fetch the next wx, add the support in a concurrency
    // safe way to avoid multiple overlapping weather fetches.
    fetchInfo ({state, rootState, rootGetters, dispatch, commit}) {
      const getDef = {
        url: rootState.race.info.weatherurl,
        params: {
          token: rootState.auth.token,
        },
        useArrays: false,
        dataField: 'weatherinfo',
      };
      if (rootGetters['solapi/isLocked']('weather')) {
        return;
      }
      commit('solapi/lock', 'weather', {root: true});

      dispatch('solapi/get', getDef, {root: true})
      .then(weatherInfo => {
        let dataUrl = weatherInfo.url;
        if (dataUrl === state.data.url) {
          commit('solapi/unlock', 'weather', {root: true});
          commit('updateFetchTime', rootGetters['time/now']());
          return;
        }
        dispatch('fetchData', dataUrl);
      })
      .catch(err => {
        commit('solapi/unlock', 'weather', {root: true});
        commit('solapi/logError', {
          apiCall: 'weather',
          error: err,
        }, {root: true});
      });
    },

    fetchData ({state, rootState, rootGetters, commit, dispatch}, dataUrl) {
      const getDef = {
        url: dataUrl,
        params: {
          token: rootState.auth.token,
        },
        useArrays: false,
        dataField: 'weathersystem',
      };

      dispatch('solapi/get', getDef, {root: true})
      .then(weatherData => {
        const firstWeather = (state.data.updated === null);

        let boundary = L.latLngBounds(
          L.latLng(weatherData.$.lat_min, weatherData.$.lon_min),
          L.latLng(weatherData.$.lat_max, weatherData.$.lon_max));

        const updated = UTCToMsec(weatherData.$.last_updated);
        if (updated === null) {
          console.log("Invalid date in weather data!");
          return;
        }

        let timeSeries = [];
        let windMap = [];
        /* FIXME: It takes quite long time to parse&mangle the arrays here,
         * perhaps use vue-worker for this but then also xml2js parsing will
         * consume lots of time. My initial attempt failed on lacking
         * this.$worker for solapi side so the JS syntax needs to solved
         * for this conversion to take place.
         */
        for (let frame of weatherData.frames.frame) {
          const utc = UTCToMsec(frame.$.target_time);
          if (utc === null) {
            console.log("Invalid date in weather data!");
            return;
          }
          timeSeries.push(utc);

          let u = frame.U.trim().split(/;\s*/);
          let v = frame.V.trim().split(/;\s*/);
          if (u.length !== v.length) {
            console.log("Inconsistent weather data!");
            return;
          }

          let windFrame = [];
          for (let i = 0; i < u.length-1; i++) {
            if (u[i] === '') {
              break;
            }

            let uu = u[i].trim().split(/\s+/);
            let vv = v[i].trim().split(/\s+/);

            if (uu.length !== vv.length) {
              console.log("Inconsistent weather data!");
              return;
            }

            /* Construct last-level [u, v] arrays */
            let windRow = [];
            for (let j = 0; j < uu.length; j++) {
              let tmp = [parseFloat(uu[j]), parseFloat(vv[j])];
              windRow.push(Object.freeze(tmp));
            }
            windFrame.push(Object.freeze(windRow));
          }
          windMap.push(Object.freeze(windFrame));
        }
        windMap = Object.freeze(windMap);

        let origo = [parseFloat(weatherData.$.lat_min),
                     parseFloat(weatherData.$.lon_min)];
        let increment = [parseFloat(weatherData.$.lat_increment),
                         parseFloat(weatherData.$.lon_increment)];

        /* Improve performance by freezing all interpolation related
         * array objects. This avoid adding unnecessary reactivity detectors.
         */
        timeSeries = Object.freeze(timeSeries);
        origo = Object.freeze(origo);
        increment = Object.freeze(increment);
        boundary = Object.freeze(boundary);

        let weatherInfo = {
          url: dataUrl,
          updated: updated,
          boundary: boundary,
          timeSeries: timeSeries,
          origo: origo,
          increment: increment,
          windMap: windMap,
        };
        commit('update', weatherInfo);
        const now = rootGetters['time/now']();
        commit('updateFetchTime', now);
        if (!firstWeather) {
          const d = new Date(now);
          const time = d.getUTCHours() + ':' + d.getUTCMinutes();
          dispatch('notifications/add', {
            text: 'Weather updated at ' + time,
          }, {root: true});
        }
      })
      .catch(err => {
        commit('solapi/logError', {
          apiCall: 'weather',
          error: err,
        }, {root: true});
      })
      .finally(() => {
        commit('solapi/unlock', 'weather', {root: true});
      });
    },
    parseUpdateTimes({commit}, description) {
      const regex = /WX [Uu]pdates: *<br> *([0-2][0-9][0-5][0-9]) *\/ *([0-2][0-9][0-5][0-9]) *\/ *([0-2][0-9][0-5][0-9]) *\/ *([0-2][0-9][0-5][0-9])\.* *<br>/;
      const w = regex.exec(description);
      if (w === null) {
        console.log('No WX update times found in description!');
        return;
      }
      let times = [];
      for (let i = 1; i <= 4; i++) {
        let time = +('1' + w[i]);
        if ((time < 10000) || (12400 < time)) {
          console.log('Invalid WX update time: ' + w[i]);
          return;
        }
        time -= 10000;
        const wxMinutes = Number((time / 100).toFixed(0)) * 60 + (time % 100);
        times.push(wxMinutes);
      }
      commit('setUpdateTimes', times);
    },
  },
}
