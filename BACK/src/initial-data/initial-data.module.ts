import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TenantsModule } from '../tenants/tenants.module';
import { InitialDataRegistry } from './initial-data.registry';
import { InitialDataRepository } from './initial-data.repository';
import { InitialDataService } from './initial-data.service';

@Module({
  imports: [DiscoveryModule, TenantsModule],
  providers: [InitialDataRegistry, InitialDataRepository, InitialDataService],
})
export class InitialDataModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitialDataModule.name);

  constructor(private readonly initialData: InitialDataService) {}

  // Las versiones nuevas que trae un despliegue llegan a las empresas que ya
  // existían; las que están al día no abren ninguna transacción.
  async onApplicationBootstrap() {
    try {
      const { tenants, failed } = await this.initialData.applyToAllTenants();
      if (failed > 0) {
        this.logger.warn(
          `Datos iniciales: ${failed} de ${tenants} empresas con errores`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Datos iniciales sin aplicar al arrancar: ${(error as Error).message}`,
      );
    }
  }
}
