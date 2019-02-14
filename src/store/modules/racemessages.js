import { orderBy } from 'lodash';
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
      for (let message of messages) {
        const newId = parseInt(message.id);
        if (Number.isFinite(newId) && newId > state.lastId) {
          state.lastId = newId;
        }
        message.message = ('<p>' + message.message.replace(/\n/g, '</p><p>') + '</p>').replace(/<p><\/p>/g, '')
      }
      state.racemsgs = orderBy(messages.concat(state.racemsgs), 'last_updated', 'desc');
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
    fetch({rootState, state, commit, dispatch}) {
      const getDef = {
        url: "/webclient/race_messages.xml",
        params: {
          token: rootState.auth.token,
          request_msg_id: state.lastId + 1,
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
