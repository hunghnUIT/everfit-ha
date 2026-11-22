import { closeTestApps } from './app';
import { resetDatabase } from './database';

beforeAll(resetDatabase);
afterAll(closeTestApps);
