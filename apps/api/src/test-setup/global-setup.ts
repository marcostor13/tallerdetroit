import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Levanta UNA sola instancia de MongoDB en memoria para toda la suite.
 *
 * Antes cada archivo de pruebas creaba la suya: dos réplicas arrancando a la vez
 * competían por CPU y puertos, y el healthcheck del test de arranque fallaba de
 * forma intermitente en CI. Con una compartida el problema desaparece y las
 * pruebas tardan bastante menos.
 *
 * Cada suite usa su propia BASE DE DATOS dentro de esa instancia, así que siguen
 * aisladas entre sí.
 */
export default async function globalSetup(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

  process.env['MONGO_TEST_URI'] = replSet.getUri();

  // El teardown necesita la referencia; `globalThis` es el único canal entre
  // globalSetup y globalTeardown.
  (globalThis as { __MONGO_REPLSET__?: MongoMemoryReplSet }).__MONGO_REPLSET__ = replSet;
}
