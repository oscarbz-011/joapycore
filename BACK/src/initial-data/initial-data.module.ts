import {
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TenantsModule } from '../tenants/tenants.module';
import { InitialDataRegistry } from './initial-data.registry';
import { InitialDataRepository } from './initial-data.repository';
import { InitialDataService } from './initial-data.service';

@Module({
  imports: [DiscoveryModule, TenantsModule],
  providers: [InitialDataRegistry, InitialDataRepository, InitialDataService],
})
export class InitialDataModule
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InitialDataModule.name);
  private sync?: Promise<void>;

  constructor(private readonly initialData: InitialDataService) {}

  // Las versiones nuevas que trae un despliegue llegan a las empresas que ya
  // existían. Corre de fondo para no demorar el arranque.
  onApplicationBootstrap() {
    this.sync = this.initialData
      .applyToAllTenants()
      .then(({ tenants, failed }) => {
        if (failed > 0) {
          this.logger.warn(
            `Datos iniciales: ${failed} de ${tenants} empresas con errores`,
          );
        }
      })
      .catch((error: Error) => {
        this.logger.warn(
          `Datos iniciales sin aplicar al arrancar: ${error.message}`,
        );
      });
  }

  async onModuleDestroy() {
    this.initialData.stop();
    await this.sync;
  }
}
