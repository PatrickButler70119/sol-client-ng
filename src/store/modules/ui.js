import boatlistsModule from './boatlists.js';
import poiModule from './poi.js';
import rulerModule from './ruler.js';
import { configSetValue } from '../../components/config/configstore.js';

export default {
  namespaced: true,

  modules: {
    boatlists: boatlistsModule,
    poi: poiModule,
    ruler: rulerModule,
  },

  state: {
    activeTab: 0,
    alert: [false, false, false, false, false, false],
    uiModeCancel: null,
    config: {
      loaded: false,
      showEditor: false,
    },
    showHelp: false,
    cfg: {
      gcMode: {
        value: true,
        type: 'boolean',
        cfgText: 'Use great-circle distance',
      },
      coordinateFormat: {
        value: 'degmin',
        values: [
          ['degmin', "DD\xb0MM.mmm'H"],
          ['deg', 'DD.ddddd\xb0H'],
          ['signdeg', '+/-DD.ddddd\xb0'],
          ['signdegnosym', '+/-DD.ddddd'],
        ],
        type: 'values',
        cfgText: 'Lat/Lon format',
      },
      cursorLines: {
        value: 'none',
        values: [
          ['none', "None"],
          ['normal', "Horizontal and vertical"],
          ['wind', "Wind based"],
        ],
        type: 'values',
        cfgText: 'Auxiliary cursor lines',
      },
      dayNightMode: {
        value: 'default',
        values: [
          ['default', 'Default'],
          ['day', 'Daylight only'],
          ['white', 'White, no terminator'],
          ['dark', 'Dark only'],
        ],
        type: 'values',
        cfgText: 'Day/night mode',
      },
    },
  },

  mutations: {
    setActiveTab(state, activeTab) {
      state.activeTab = activeTab;
      state.alert[activeTab] = false;
    },
    raiseAlert(state, alertTab) {
      if (state.activeTab !== alertTab) {
        state.alert[alertTab] = true;
      }
    },
    setUiModeCancel(state, cancelMutation) {
      state.uiModeCancel = cancelMutation;
    },
    showConfigEditor(state) {
      state.config.showEditor = true;
    },
    closeConfigEditor(state) {
      state.config.showEditor = false;
    },
    showQuickHelp(state) {
      state.showHelp = true;
    },
    closeQuickHelp(state) {
      state.showHelp = false;
    },
    configLoaded(state) {
      state.config.loaded = true;
    },
    configSetValue,
  },
  getters: {
    inDefaultUiMode: (state) => {
      return state.uiModeCancel === null;
    },
    coordinateSignToHemisphere: (state) => {
      return (state.cfg.coordinateFormat.value !== 'signdeg') &&
             (state.cfg.coordinateFormat.value !== 'signdegnosym');
    },
    coordinateNoDegSymbol: (state) => {
      return state.cfg.coordinateFormat.value === 'signdegnosym';
    },
    currentDayNight: (state, getters, rootState, rootGetters) => {
      if (state.cfg.dayNightMode.value === 'default') {
        const boatInDark = rootGetters['boat/inDark'];
        return boatInDark ? 'dark' : 'white';
      }
      if (state.cfg.dayNightMode.value === 'dark') {
        return 'dark';
      }
      return 'white';
    },
    isDark: (state, getters) => {
      return getters['currentDayNight'] === 'dark';
    },
  },
  actions: {
    setUiMode({state, commit}, uiMode) {
      /* Change the mode, clear the previous mode before setting new */
      if (state.uiModeCancel !== uiMode.cancel) {
        if (state.uiModeCancel !== null) {
          commit(state.uiModeCancel, null, {root: true});
        }
        commit('setUiModeCancel', uiMode.cancel);
      }
      /* Cancelling asked, remove cancel then too */
      if (state.uiModeCancel === uiMode.newMode) {
        commit('setUiModeCancel', null);
      }
      commit(uiMode.newMode, uiMode.param, {root: true});
    },
    cancelUiMode({state, commit}) {
      if (state.uiModeCancel !== null) {
        commit(state.uiModeCancel, null, {root: true});
      }
      commit('setUiModeCancel', null);
    }
  },
}
