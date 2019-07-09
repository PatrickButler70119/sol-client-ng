import Vue from 'vue';
import Vuex from 'vuex';
import timeModule from './modules/time';
import authModule from './modules/auth';
import uiModule from './modules/ui';
import notificationsModule from './modules/notifications';
import solapiModule from './modules/solapi';
import boatModule from './modules/boat';
import raceModule from './modules/race';
import weatherModule from './modules/weather';
import chatroomsModule from './modules/chatrooms';
import mapModule from './modules/map';
import mapTilesModule from './modules/tiles';
import diagnosticsModule from './modules/diagnostics';

Vue.use(Vuex);

export default new Vuex.Store({
  modules: {
    time: timeModule,
    auth: authModule,
    ui: uiModule,
    notifications: notificationsModule,
    solapi: solapiModule,
    boat: boatModule,
    race: raceModule,
    weather: weatherModule,
    chatrooms: chatroomsModule,
    map: mapModule,
    tiles: mapTilesModule,
    diagnostics: diagnosticsModule,
  },
});
