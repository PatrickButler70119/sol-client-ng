import Vue from 'vue';
import L from 'leaflet';
import rbush from 'rbush';
import { minToMsec, secToMsec } from '../../lib/utils.js';
import { PROJECTION } from '../../lib/sol.js';

export default {
  namespaced: true,

  state: {
    /* Set to latest known new boat ID. Once metainfo for it arrives, we
     * should have it for all boats if the SOL API is sane.
     */
    newBoatId: null,
    fleetTime: 0,
    fleetFetchInterval: secToMsec(55),
    tracesTime: 0,
    tracesFetchInterval: minToMsec(3),
    boat: [],
    id2idx: {},
    leader: null,
    boatTypes: new Set(),    /* Sets are not not reactive! */
    boatTypesCount: 0,       /* works around lack of reactivity */
    selected: [],
    hover: [],
    searchTree: rbush(9, ['.lng', '.lat', '.lng', '.lat']),
    playerBoatIdx: 0,
  },

  mutations: {
    initMyBoat (state, boatData) {
      if (typeof state.id2idx[boatData.id] !== 'undefined') {
        return;
      }
      Vue.set(state.id2idx, boatData.id, state.boat.length);
      state.boat.push({
        id: boatData.id,
        name: boatData.name,
        color: {
          r: 255,
          g: 0,
          b: 255,
        },
        type: '',

        dtg: parseFloat(boatData.dtg),
        dbl: boatData.dbl,

        lat: boatData.lat,
        lon: boatData.lon,
        cog: parseFloat(boatData.cog),

        ranking: parseInt(boatData.ranking),
        lastRoundedMark: parseInt(boatData.current_leg),
        log: 0,

        latLng: L.latLng(boatData.lat, boatData.lon),
        syc: false,
        country: null,
        trace: [],
      });
    },
    updateFleet (state, update) {
      state.fleetTime = update.timestamp;
      let searchData = [];

      for (let boat of update.fleet) {
        const id = boat.id;
        const latLng = L.latLng(boat.lat, boat.lon);

        /* Don't show PR markers after practice period */
        if (!boat.name.startsWith('Practice_Mark') || update.inPractice) {
          for (let ddeg = -360; ddeg <= 360; ddeg += 360) {
            let searchItem = {
              lng: latLng.lng + ddeg,
              lat: latLng.lat,
              id: boat.id,
            };
            Object.freeze(searchItem);
            searchData.push(searchItem);
          }
        }

        if (typeof state.id2idx[id] !== 'undefined') {
          const idx = state.id2idx[id];
          state.boat[idx].name = boat.name;
          if (state.boat[idx].type !== boat.type) {
            state.boat[idx].type = boat.type;
            if (boat.type !== 'Tender boat') {
              state.boatTypes.add(boat.type);
            }
          }
          /* Store position to trace if moved. */
          if (!state.boat[idx].latLng.equals(latLng)) {
            // ADDME: consider removing constant cog points, maybe not useful?
            // ADDME: if cog changed a lot, calculate an intersection too?
            // FIXME: What if traces API fails, this could grow very large.
            // FIXME: latLngRaceBounds would be needed here but not avail!
            state.boat[idx].trace.push(latLng);
          }
          state.boat[idx].latLng = latLng;
          state.boat[idx].cog = parseFloat(boat.cog);

          state.boat[idx].ranking = parseInt(boat.ranking);
          state.boat[idx].dtg = parseFloat(boat.dtg);
          state.boat[idx].dbl = boat.dbl;
          state.boat[idx].log = boat.log;
          state.boat[idx].lastRoundedMark = parseInt(boat.current_leg);

          if (idx > state.playerBoatIdx) {
            if (state.boat[idx].ranking === 1) {
              state.leader = id;
              state.boat[idx].color = { r: 204, g: 0, b: 204 };
            } else {
              state.boat[idx].color = {
                r: boat.color_R,
                g: boat.color_G,
                b: boat.color_B,
              };
            }
          }
        } else {
          delete boat.lat;
          delete boat.lon;
          boat.latLng = latLng;

          boat.syc = false;
          boat.country = null;

          boat.color = {
            r: boat.color_R,
            g: boat.color_G,
            b: boat.color_B,
          };
          delete boat.color_R;
          delete boat.color_G;
          delete boat.color_B;

          boat.trace = [boat.latLng];
          boat.cog = parseFloat(boat.cog);
          boat.ranking = parseInt(boat.ranking);
          boat.dtg = parseFloat(boat.dtg);
          boat.lastRoundedMark = parseInt(boat.current_leg);
          delete boat.current_leg;

          if (boat.ranking === 1) {
            state.leader = id;
            boat.color = { r: 204, g: 0, b: 204 };
          }
          Vue.set(state.id2idx, id, state.boat.length);
          state.boat.push(boat);

          state.newBoatId = id;

          if (boat.type !== 'Tender boat') {
            state.boatTypes.add(boat.type);
          }
        }
      }

      state.searchTree.clear();
      state.searchTree.load(searchData);

      state.boatTypesCount = state.boatTypes.length;
    },
    updateFleetMeta (state, meta) {
      for (let boat of meta) {
        const id = boat.$.id;

        /* If not in the fleet yet, postpone all work to the next metainfo
         * for this boat in order to have simpler state invariants.
         */
        if (typeof state.id2idx[id] !== 'undefined') {
          const idx = state.id2idx[id];

          if (state.newBoatId === id) {
            state.newBoatId = null;
          }
          state.boat[idx].syc = (boat.$.syc === 'True');
          state.boat[idx].country = boat.$.c;
        }
      }
    },
    updateBoatTrace (state, traceData) {
      const id = traceData.id;
      if (typeof state.id2idx[id] !== 'undefined') {
        const idx = state.id2idx[traceData.id];
        state.boat[idx].trace = traceData.trace;
        state.tracesTime = traceData.time;
      }
    },
    setSelected (state, ids) {
      state.selected = ids;
    },
    setHover (state, ids) {
      state.hover = ids;
    },
  },

  getters: {
    /* pixelDistance for these search function is x or y distance, thus
     * searching squares rather than circles
     */
    searchAt: (state, getters) => (latLng, zoom, pixelDistance) => {
      const dummyBBox = L.latLngBounds(latLng, latLng);
      return getters['searchBBox'](dummyBBox, zoom, pixelDistance);
    },
    searchBBox: (state) => (latLngBounds, zoom, pixelDistance) => {
      let bl = PROJECTION.latLngToPoint(latLngBounds.getSouthWest(), zoom);
      let tr = PROJECTION.latLngToPoint(latLngBounds.getNorthEast(), zoom);
      bl = bl.add(L.point(-pixelDistance, pixelDistance));
      tr = tr.add(L.point(pixelDistance, -pixelDistance));
      const swWithMargin = PROJECTION.pointToLatLng(bl, zoom);
      const neWithMargin = PROJECTION.pointToLatLng(tr, zoom);
      // FIXME: is NaN check needed after unprojects with enlarged coords?
      const needle = {
        minX: swWithMargin.lng,
        minY: swWithMargin.lat,
        maxX: neWithMargin.lng,
        maxY: neWithMargin.lat,
      };

      return state.searchTree.search(needle);
    },

    boatFromId: (state) => (id) => {
      const idx = state.id2idx[id];
      return state.boat[idx];
    },
    /* Does not use state, just to use common code for boat colors */
    boatColor: () => (boat) => {
      return 'rgb(' + boat.color.r + ',' + boat.color.g + ',' + boat.color.b + ', 0.8)';
    },

    multiClassRace: (state) => {
      return state.boatTypes.count > 1;
    },

    nextTimeToFetch: (state) => {
      return state.fleetTime + state.fleetFetchInterval;
    },
    nextTimeToFetchTraces: (state) => {
      return state.tracesTime + state.tracesFetchInterval;
    }
  },

  actions: {
    fetchRace({rootState, state, getters, rootGetters, commit, dispatch}) {
      const getDef = {
        url: "/webclient/race_" + rootState.auth.raceId + ".xml",
        params: {
          token: rootState.auth.token,
        },
        useArrays: false,
        dataField: 'race',
        compressedPayload: true,
      };
      if (rootGetters['solapi/isLocked']('fleet')) {
        return;
      }
      commit('solapi/lock', 'fleet', {root: true});

      dispatch('solapi/get', getDef, {root: true})
      .then(raceInfo => {
        const now = rootGetters['time/now']();

        commit('race/updateMessage', raceInfo.message, {root: true});

        if ((typeof raceInfo.boats !== 'undefined') &&
            (typeof raceInfo.boats.boat !== 'undefined')) {
          let boatList = raceInfo.boats.boat;
          if (!Array.isArray(boatList)) {
            boatList = [boatList];
          }

          commit('updateFleet', {
            timestamp: now,
            inPractice: rootGetters['race/isPracticePeriod'],
            fleet: boatList,
          });

          if (state.newBoatId !== null) {
            dispatch('fetchMetainfo');
          }
          if (getters['nextTimeToFetchTraces'] <= now) {
            dispatch('fetchTraces');
          }
        }
      })
      .catch(err => {
        commit('solapi/logError', err, {root: true});
      })
      .finally(() => {
        commit('solapi/unlock', 'fleet', {root: true});
      });
    },

    fetchMetainfo({rootState, commit, dispatch}) {
      const getDef = {
        url: "/webclient/metainfo_" + rootState.auth.raceId + ".xml",
        params: {
          token: rootState.auth.token,
        },
        useArrays: false,
        dataField: 'boatinfo',
        compressedPayload: true,
      };

      dispatch('solapi/get', getDef, {root: true})
      .then(metaInfo => {
        let boatList = metaInfo.b;
        if (typeof boatList !== 'undefined') {
          if (!Array.isArray(boatList)) {
            boatList = [boatList];
          }
          commit('updateFleetMeta', boatList);
        }
      })
      .catch(err => {
        commit('solapi/logError', err, {root: true});
      });
    },

    fetchTraces({rootState, state, rootGetters, commit, dispatch}) {
      const getDef = {
        url: "/webclient/traces_" + rootState.auth.raceId + ".xml",
        params: {
          token: rootState.auth.token,
        },
        useArrays: false,
        dataField: 'content',
        compressedPayload: true,
      };
      if (rootGetters['solapi/isLocked']('traces')) {
        return;
      }
      commit('solapi/lock', 'traces', {root: true});

      dispatch('solapi/get', getDef, {root: true})
      .then(traces => {
        const now = rootGetters['time/now']();
        let boatList = traces.boat;
        if (typeof boatList === 'undefined') {
          return;
        }
        if (!Array.isArray(boatList)) {
          boatList = [boatList];
        }
        for (let boat of boatList) {
          const id = boat.id;

          /* Update only for the existing boats */
          if (typeof state.id2idx[id] === 'undefined') {
            continue;
          }

          let trace = [];
          const traceRaw = boat.data.split(/ /);
          for (let i = traceRaw.length - 1; i >= 0; i--) {
            const lngLatTxt = traceRaw[i];
            const lngLatArr = lngLatTxt.split(/,/);
            let latLng = L.latLng(lngLatArr[1], lngLatArr[0]);
            latLng = rootGetters['race/latLngToRaceBounds'](latLng);
            trace.push(latLng);
          }

          commit('updateBoatTrace', {
            id: id,
            time: now,
            trace: trace,
          });
        }
      })
      .catch(err => {
        commit('solapi/logError', err, {root: true});
      })
      .finally(() => {
        commit('solapi/unlock', 'traces', {root: true});
      });
    },
  },
}
