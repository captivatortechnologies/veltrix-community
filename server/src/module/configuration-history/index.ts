import configurationHistoryController from './configuration-history.controller';
import { configurationHistoryService } from './configuration-history.service';
// Import schemas if needed for registration elsewhere
import * as configurationHistorySchemas from './configuration-history.schema'; 

export {
  configurationHistoryController,
  configurationHistoryService,
  configurationHistorySchemas
};

// You might also register the controller with Fastify here or in a central plugin file
// Example (if using fastify-plugin):
// import fp from 'fastify-plugin';
// export default fp(async (fastify, opts) => {
//   fastify.register(configurationHistoryController, { prefix: '/api/configuration-history' });
// });
