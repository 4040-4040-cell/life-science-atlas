import { Router, type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import { AtlasError } from '../validation';
import { getCantonDocument, listCantonVersions, parseCantonId } from './repository';
const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };
export const cantonDetailRouter = Router();
cantonDetailRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) { res.set('Allow', 'GET, HEAD').status(405).json({ error: { code: 'READ_ONLY', message: 'Canton research endpoints are read-only.' } }); return; }
  next();
});
cantonDetailRouter.get('/:cantonId/versions', route(async (req, res) => res.json({ versions: await listCantonVersions(parseCantonId(req.params.cantonId)) })));
cantonDetailRouter.get('/:cantonId', route(async (req, res) => {
  if (req.query.version !== undefined && typeof req.query.version !== 'string') throw new AtlasError(400, 'INVALID_VERSION', 'Supply one version.');
  return res.json(await getCantonDocument(parseCantonId(req.params.cantonId), req.query.version as string | undefined));
}));
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AtlasError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
  // Never send raw SQL, source payloads or connection details to the browser.
  res.status(503).json({ error: { code: 'CANTON_DATABASE_UNAVAILABLE', message: 'Persistent canton research is unavailable. No substitute dataset was returned.' } });
};
cantonDetailRouter.use(errors);
