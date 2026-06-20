import { Module } from '@nestjs/common';
import { AreasController } from './controllers/areas.controller';
import { EmployeesController } from './controllers/employees.controller';
import { PayrollController } from './controllers/payroll.controller';
import { AreasRepository } from './repositories/areas.repository';
import { EmployeesRepository } from './repositories/employees.repository';
import { LeavesRepository } from './repositories/leaves.repository';
import { PayrollRepository } from './repositories/payroll.repository';
import { PositionsRepository } from './repositories/positions.repository';
import { AreasService } from './services/areas.service';
import { EmployeesService } from './services/employees.service';
import { PayrollService } from './services/payroll.service';

@Module({
  controllers: [AreasController, EmployeesController, PayrollController],
  providers: [
    AreasRepository,
    PositionsRepository,
    EmployeesRepository,
    LeavesRepository,
    PayrollRepository,
    AreasService,
    EmployeesService,
    PayrollService,
  ],
})
export class HrModule {}
