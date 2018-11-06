import { MS_TO_KNT } from '../../lib/sol.js';

function defaultFormat (instrument) {
  return (instrument.value * instrument.mult).toFixed(instrument.decimals);
}

export default {
  namespaced: true,
  state: {
    lat: {
      value: null,
      name: "LAT",
      unit: "\xb0",
      datafield: "lat",
      mult: 1,
      decimals: 3,
      format: defaultFormat,
    },
    lon: {
      value: null,
      name: "LON",
      unit: "\xb0",
      datafield: "lon",
      mult: 1,
      decimals: 3,
      format: defaultFormat,
    },
    speed: {
      value: null,
      name: "SPEED",
      unit: "kn",
      datafield: "sog",
      mult: 1,
      decimals: 2,
      format: defaultFormat,
    },
    course: {
      value: null,
      name: "COURSE",
      unit: "\xb0",
      datafield: "cog",
      mult: 180 / Math.PI,
      decimals: 2,
      format: defaultFormat,
    },
    twa: {
      value: null,
      name: "TWA",
      unit: "\xb0",
      datafield: "twa",
      mult: 180 / Math.PI,
      decimals: 2,
      format: defaultFormat,
    },
    twd: {
      value: null,
      name: "TWD",
      unit: "\xb0",
      datafield: "twd",
      mult: 180 / Math.PI,
      decimals: 2,
      format: defaultFormat,
    },
    tws: {
      value: null,
      name: "TWS",
      unit: "kn",
      datafield: "tws",
      mult: MS_TO_KNT,
      decimals: 2,
      format: defaultFormat,
    },
    // VMG
    // VMC
    perf: {
      value: null,
      name: "PERF",
      unit: "%",
      datafield: "efficiency",
      mult: 100,
      decimals: 2,
      format: defaultFormat,
    },
    // DATE
    // TIME
    time: {
      value: 0,
      name: "TIME",
      unit: "UTC",
      datafield: 'time',
      format: (instrument) => {
        if (instrument.value === 0) {
          return '--:--';
        }
        const d = new Date(instrument.value);
        return ("0" + d.getUTCHours()).slice(-2) + ':' +
               ("0" + d.getUTCMinutes()).slice(-2);
      },
    },
    date: {
      value: 0,
      name: "DATE",
      unit: "UTC",
      datafield: 'time',
      format: (instrument) => {
        if (instrument.value === 0) {
          return '--/--';
        }
        const d = new Date(instrument.value);
        return ("0" + (d.getUTCMonth() + 1)).slice(-2) + '/' +
               ("0" + d.getUTCDate()).slice(-2);
      },
    },

    list: [
      'lat', 'lon', 'speed', 'course', 'twa', 'twd', 'tws', 'perf',
      'time', 'date',
    ],
  },
  mutations: {
    initTime (state, time) {
      state.time.value = time;
      state.date.value = time;
    },
  }
}
