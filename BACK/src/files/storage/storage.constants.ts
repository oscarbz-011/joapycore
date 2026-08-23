import type { StorageDriverName } from '../../config/storage.config';
import type { StorageDriver } from './storage.interface';

export const STORAGE_DRIVERS = 'STORAGE_DRIVERS';

export type StorageDriverRegistry = Map<StorageDriverName, StorageDriver>;
