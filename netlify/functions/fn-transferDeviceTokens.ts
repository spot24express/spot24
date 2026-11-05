/**
 * SPOT 24 · POST /.netlify/functions/fn-transferDeviceTokens (5.122)
 * Traspaso del dispositivo al usuario que inicia sesión (equipo compartido
 * por turnos): los docs fcmTokens de este navegador registrados por OTRO
 * personal pasan a la cuenta que entra. El cliente lo llama fire-and-forget
 * tras el login; JAMÁS bloquea el inicio de sesión.
 */
import { coreTransferDeviceTokens } from '../../functions/src/deviceTokens';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreTransferDeviceTokens, req);
