import L from 'leaflet';
import raceMessageModule from './racemessages.js';
import fleetModule from './fleet.js';
import { degToRad, radToDeg, UTCToMsec } from '../../lib/utils.js';
import { minTurnAngle, atan2Bearing } from '../../lib/nav.js';
import { PROJECTION} from '../../lib/sol.js';

export default {
  namespaced: true,
  modules: {
    messages: raceMessageModule,
    fleet: fleetModule,
  },

  state: {
    loaded: false,
    info: {},
    boundary: [],
    route: [],
    finish: [],
  },

  mutations: {
    init (state, raceInfo) {
      state.boundary = raceInfo.course.boundary;
      state.route = raceInfo.course.route;
      state.finish = raceInfo.course.finish;
      delete raceInfo.course;
      state.info = raceInfo;
      state.loaded = true;
    },
    updateMessage (state, msg) {
      state.info.message = msg;
    },
  },

  getters: {
    latLngToRaceBounds: (state) => (latLng) => {
      return (latLng.lng < state.boundary[0].lng) ?
             L.latLng(latLng.lat, latLng.lng + 360) :
             latLng;
    },
    parseCourse: () => (raceInfo) => {
      let course = {
        boundary: [
          L.latLng(raceInfo.minlat, raceInfo.minlon),
          L.latLng(raceInfo.maxlat, raceInfo.maxlon)
        ],
        route: [],
        finish: [],
      };

      for (let i = 0; i < raceInfo.course.waypoint.length; i++) {
        let waypoint = raceInfo.course.waypoint[i];
        const idx = parseInt(waypoint.order) - 1;
        waypoint.lat = parseFloat(waypoint.lat);
        waypoint.lon = parseFloat(waypoint.lon);
        if (waypoint.lon < parseFloat(raceInfo.minlon)) {
          waypoint.lon += 360;
        }
        waypoint.latLng = L.latLng(waypoint.lat, waypoint.lon);
        waypoint.nextWpBearing = null;
        waypoint.side = null;

        /* Calculate bearing from prev WP to this WP ... */
        if (i > 0) {
          const prevwp = PROJECTION.project(course.route[i - 1].latLng);
          const thiswp = PROJECTION.project(waypoint.latLng);
          const bearing = atan2Bearing(thiswp.x - prevwp.x, thiswp.y - prevwp.y);
          course.route[i - 1].nextWpBearing = bearing;

          /* ...and which side to pass the prev WP */
          if (i > 1) {
            const turn = minTurnAngle(course.route[i - 2].nextWpBearing,
                                      bearing);
            course.route[i - 1].side = (turn < 0 ? "Port" : "Starboard");
          }
        }
        course.route[idx] = waypoint;
      }

      const angularDist = degToRad(parseFloat(raceInfo.course.goal_radius) / 60);
      const center = course.route[course.route.length - 1].latLng;
      const centerProj = PROJECTION.project(center);
      for (let i = 0; i <= 1; i++) {
        const angle = course.route[course.route.length - 2].nextWpBearing +
                             Math.PI / 2 + i * Math.PI;
        const dlat = Math.asin(Math.sin(angle - Math.PI / 2) * Math.sin(angularDist));
        const ep_lat = center.lat + radToDeg(dlat);
        const dy = PROJECTION.project(L.latLng(ep_lat, center.lng)).y - centerProj.y;
        const dx = Math.tan(angle) * dy;
        const endpoint = PROJECTION.unproject(L.point(centerProj.x + dx, centerProj.y + dy));
        course.finish.push(endpoint);
      }

      return course;
    },
  },

  actions: {
    fetchAuthRaceinfo ({rootState, getters, rootGetters, commit, dispatch}) {
      /* Initialize time before boat/wx is fetched to avoid issues */
      const now = rootGetters['time/now']();
      commit('boat/instruments/initTime', now, {root: true});
      commit('weather/initTime', now, {root: true});

      const getDef = {
        url: "/webclient/auth_raceinfo_" + rootState.auth.race_id + ".xml",
        params: {
          token: rootState.auth.token,
        },
        useArrays: false,
        dataField: 'race',

        dataHandler: (raceInfo) => {
          const polarRawData = raceInfo.boat.vpp;
          const chatroomsData = raceInfo.chatrooms.chatroom;

          commit('chatrooms/init', chatroomsData, {root: true});

          delete raceInfo.boat;
          delete raceInfo.chatrooms;
          raceInfo.start_time = UTCToMsec(raceInfo.start_time);
          raceInfo.course = getters['parseCourse'](raceInfo);
          commit('init', raceInfo);

          commit('boat/polar/set', polarRawData, {root: true});

          /* Start race API fetching */
          dispatch('boat/fetch', null, {root: true});
          dispatch('boat/steering/fetchDCs', null, {root: true});
          dispatch('weather/fetchInfo', null, {root: true});
          dispatch('fleet/fetchRace');
        },
      };

      dispatch('solapi/get', getDef, {root: true});
    },
  },
}
