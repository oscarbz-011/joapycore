import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { EmployeesService } from '../services/employees.service';

@ApiTags('HR')
@ApiBearerAuth()
@RequiredModule('hr')
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List all employees' })
  list(@CurrentTenant() tenantId: string) {
    return this.employeesService.list(tenantId);
  }

  @Get(':id')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'Get employee by id' })
  getById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.employeesService.getById(tenantId, id);
  }

  @Post()
  @Permissions('hr:employees:create')
  @ApiOperation({ summary: 'Create employee (optionally creates linked user account)' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('hr:employees:update')
  @ApiOperation({ summary: 'Update employee data' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(tenantId, id, dto);
  }

  @Post(':id/terminate')
  @Permissions('hr:employees:terminate')
  @ApiOperation({ summary: 'Dar de baja a un empleado (desactiva el usuario vinculado)' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { terminationDate: { type: 'string', format: 'date', example: '2025-12-31' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Empleado dado de baja' })
  @ApiResponse({ status: 422, description: 'El empleado ya fue dado de baja' })
  terminate(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: { terminationDate?: string },
  ) {
    return this.employeesService.terminate(tenantId, id, body.terminationDate);
  }

  @Post(':id/reset-password')
  @Permissions('hr:employees:update')
  @ApiOperation({ summary: 'Generar nueva contraseña temporal para el usuario del empleado' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiResponse({ status: 201, schema: { example: { tempPassword: 'aB3kR7mN2p' } } })
  @ApiResponse({ status: 422, description: 'El empleado no tiene usuario vinculado' })
  resetPassword(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.employeesService.resetUserPassword(tenantId, id);
  }

  @Post(':id/link-user')
  @Permissions('hr:employees:update')
  @ApiOperation({ summary: 'Vincular usuario externo existente a este empleado' })
  @ApiParam({ name: 'id', description: 'Employee UUID' })
  @ApiBody({ schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } })
  @ApiResponse({ status: 201, description: 'Usuario vinculado correctamente' })
  @ApiResponse({ status: 409, description: 'El usuario ya está vinculado a otro empleado' })
  linkUser(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: { email: string },
  ) {
    return this.employeesService.linkUser(tenantId, id, body.email);
  }
}
