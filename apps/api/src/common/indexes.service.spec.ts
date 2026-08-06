import { Test } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import mongoose, { Connection, Schema } from 'mongoose';
import { testUri } from '../test-setup/test-uri';
import { IndexesService } from './indexes.service';

/**
 * Lo que se prueba aquí es el escenario de **producción**, donde `autoIndex`
 * está apagado y por tanto Mongoose no crea ningún índice por su cuenta.
 *
 * No sirve comprobarlo desde los tests de extremo a extremo: allí `autoIndex`
 * está encendido y el índice acaba existiendo aunque este servicio no haga
 * nada, con lo que la comprobación pasaría siempre y no probaría nada.
 */
describe('IndexesService', () => {
  const OrdenSchema = new Schema({ numero: String });
  OrdenSchema.index({ numero: 1 }, { unique: true });

  let connection: Connection;
  let servicio: IndexesService;

  const indiceUnico = async () => {
    const indices = await connection.collection('indexprobes').indexes();
    return indices.find((i) => JSON.stringify(i.key) === JSON.stringify({ numero: 1 }));
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        // `autoIndex: false` es exactamente lo que corre en producción.
        MongooseModule.forRoot(testUri('dps-indexes-test'), { autoIndex: false }),
        MongooseModule.forFeature([{ name: 'IndexProbe', schema: OrdenSchema }]),
      ],
      providers: [IndexesService],
    }).compile();

    connection = modulo.get<Connection>(getConnectionToken());
    servicio = modulo.get(IndexesService);

    // Se fuerza la creación de la colección para poder listar sus índices.
    await connection.collection('indexprobes').insertOne({ numero: 'LIM-TAL-000001' });
  }, 180_000);

  afterAll(async () => {
    await connection?.close();
    await mongoose.disconnect().catch(() => undefined);
  });

  it('sin el servicio, el índice único no existe: la unicidad no la garantiza nada', async () => {
    expect(await indiceUnico()).toBeUndefined();
  }, 30_000);

  it('el servicio lo crea, y queda listo antes de atender la primera petición', async () => {
    // `onApplicationBootstrap` lo espera `app.init()`, así que al terminar el
    // arranque los índices ya están construidos: no hay ventana en la que un
    // duplicado pueda colarse.
    await servicio.onApplicationBootstrap();

    const indice = await indiceUnico();
    expect(indice?.unique).toBe(true);
  }, 60_000);

  it('un índice que no se puede construir no tumba el arranque', async () => {
    // Dos filas con el mismo número: el índice único ya no se puede crear. La
    // API tiene que seguir arrancando —dejarla caída no arregla los datos— y
    // dejar constancia de qué hay que limpiar.
    await connection.collection('indexprobes').dropIndexes();
    await connection
      .collection('indexprobes')
      .insertMany([{ numero: 'LIM-TAL-000002' }, { numero: 'LIM-TAL-000002' }]);

    await expect(servicio.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(await indiceUnico()).toBeUndefined();
  }, 60_000);
});
