import { Injectable, OnModuleInit, SetMetadata } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { InitialDataSet } from './initial-data.types';

const INITIAL_DATA_SET = 'joapy:initial-data-set';

/** Marca el provider de un conjunto de datos iniciales de un módulo. */
export const InitialData = () => SetMetadata(INITIAL_DATA_SET, true);

@Injectable()
export class InitialDataRegistry implements OnModuleInit {
  private sets: InitialDataSet[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    const found: InitialDataSet[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      if (!wrapper.metatype || !wrapper.isDependencyTreeStatic()) continue;
      if (!this.reflector.get<boolean>(INITIAL_DATA_SET, wrapper.metatype)) {
        continue;
      }
      found.push(wrapper.instance as InitialDataSet);
    }
    this.sets = [];
    for (const set of found) this.register(set);
  }

  register(set: InitialDataSet) {
    const name = set.definition.name;
    if (this.sets.some((s) => s.definition.name === name)) {
      throw new Error(`Conjunto de datos iniciales repetido: ${name}`);
    }
    this.sets.push(set);
  }

  all(): readonly InitialDataSet[] {
    return this.sets;
  }
}
