import { orderBy } from 'lodash';
import { UTCToMsec } from '../../lib/utils.js';
import { SkipThenError, solapiRetryDispatch, solapiLogError } from '../../lib/solapi.js';

export default {
  namespaced: true,

  state: {
    racemsgs: [],
    lastId: 0,
    expectedId: 0,
  },

  mutations: {
    add (state, messages) {
      for (let i = messages.length - 1; i >= 0; i--) {
        let message = messages[i];
        const newId = parseInt(message.id);
        if (!Number.isFinite(newId)) {
          continue;
        } else if (newId <= state.lastId) {
          continue;
        } else if (newId > state.lastId) {
          state.lastId = newId;
        }
        message.message = ('<p>' + message.message.replace(/\n/g, '</p><p>') + '</p>').replace(/<p><\/p>/g, '')
        message.lastUpdated = UTCToMsec(message.last_updated);
        delete message.last_updated;

        state.racemsgs.unshift(message);
      }
      state.racemsgs = orderBy(state.racemsgs, 'lastUpdated', 'desc');
    },
    updateExpected(state, expectedId) {
      if (expectedId > state.expectedId) {
        if (state.expectedId === state.lastId) {
          this.dispatch('race/messages/fetch');
        }
      }
      state.expectedId = expectedId;
    }    
  },

  actions: {
    fetch({state, rootState, commit, dispatch}) {
      const getDef = {
        url: "/webclient/race_messages.xml",
        params: {
          token: rootState.auth.token,
          request_msg_id: state.lastId + 1, /* Doesn't seem to work as expected */
        },
        useArrays: false,
        dataField: 'racemessages',
      };

      dispatch('solapi/get', getDef, {root: true})
      .catch(err => {
        solapiLogError(err);
        throw new SkipThenError();
      })
      .then(raceMessages => {
        if (typeof raceMessages.racemessage === 'undefined') {
          return;
        }
        if (!Array.isArray(raceMessages.racemessage)) {
          raceMessages.racemessage = [raceMessages.racemessage];
        }
        commit('add', raceMessages.racemessage);
        commit('ui/setActiveTab', 4, {root: true});
      })
      .catch(err => {
        solapiLogError(err);
      })
      .finally(() => {
        /* New messages appeared during our last fetch, fetch again */
        if (state.expectedId > state.lastId) {
          solapiRetryDispatch(dispatch, 'fetch', undefined, 1000);
        }
      });
    },
  },
}
