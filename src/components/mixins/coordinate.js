import { mapState } from 'vuex';
import { roundToFixed } from '../../lib/quirks.js';

const snHemispheres = ['S', 'N'];
const weHemispheres = ['W', 'E'];

export let coordinateMixin = {
  props: {
    latLng: {
      type: Object,
    }
  },
  computed: {
    precision () {
      return 5;
    },
    latFormatted () {
      if ((typeof this.latLng === 'undefined') || (this.latLng === null)) {
        return '';
      }
      return this.formatCoordinate(this.latLng.lat, snHemispheres);
    },
    lngFormatted () {
      if ((typeof this.latLng === 'undefined') || (this.latLng === null)) {
        return '';
      }
      return this.formatCoordinate(this.latLng.lng, weHemispheres);
    },
    ...mapState({
      coordinateFormat: state => state.ui.cfg.coordinateFormat.value,
    }),
  },
  methods: {
    formatCoordinate (value, hemispheres) {
      const noDegSymbol = this.coordinateFormat.value === 'signdegnosym';
      const signToHemisphere = (this.coordinateFormat.value !== 'signdeg') &&
                               (this.coordinateFormat.value !== 'signdegnosym');
      const absValue = Math.abs(value);
      let text;

      if (this.coordinateFormat === 'degmin') {
        let degs = Math.floor(absValue);
        /* CHECKME: Precision approximation by subtracting -2 ok? */
        let minutes = roundToFixed((absValue - degs) * 60, this.precision - 2);
        if (minutes.startsWith('60')) {
          degs += 1;
          minutes = roundToFixed(0, this.precision - 2);
        }
        text = degs + '\xb0' + minutes + "'";
      } else {
        text = roundToFixed(absValue, this.precision) +
               (noDegSymbol ? '' : '\xb0');
      }

      if (signToHemisphere) {
        text = text + hemispheres[value < 0 ? 0 : 1];
      } else if (value < 0) {
        text = '-' + text;
      }
      return text;
    },
  },
}
