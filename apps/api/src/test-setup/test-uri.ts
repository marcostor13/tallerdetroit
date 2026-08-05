/**
 * Construye la URI de una base concreta dentro de la instancia compartida.
 *
 * No se puede concatenar el nombre al final: `getUri()` de un replica set
 * devuelve la cadena con query string (`mongodb://host:puerto/?replicaSet=…`),
 * asi que pegar el nombre detras produce `?replicaSet=testsetdps-auth-test`.
 * Hay que insertarlo ANTES de la interrogacion.
 */
export function testUri(dbName: string): string {
  const base = process.env['MONGO_TEST_URI'];
  if (!base) {
    throw new Error(
      'Falta MONGO_TEST_URI: el globalSetup de Jest no llego a levantar MongoDB en memoria.',
    );
  }

  const i = base.indexOf('?');
  const sinQuery = i === -1 ? base : base.slice(0, i);
  const query = i === -1 ? '' : base.slice(i);

  return `${sinQuery.replace(/\/+$/, '')}/${dbName}${query}`;
}
