import { defineParameterType } from '@cucumber/cucumber';
import { StubRoute } from '../../src/stubs/openMeteoStub';

const UPSTREAMS: Record<string, StubRoute> = {
  forecast: 'forecast',
  'geocoding search': 'geocoding',
  'location lookup': 'lookup',
};

/** {upstream}: which Open-Meteo endpoint a fault is injected into. */
defineParameterType({
  name: 'upstream',
  regexp: /forecast|geocoding search|location lookup/,
  transformer: (s: string): StubRoute => UPSTREAMS[s],
});
