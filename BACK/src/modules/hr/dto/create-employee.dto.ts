import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ContractType, DocumentType, Gender, MaritalStatus, PaymentMethod } from '@prisma/client';

export class CreateEmployeeDto {
  // Personal
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty({ enum: DocumentType }) @IsEnum(DocumentType) documentType: DocumentType;
  @ApiProperty() @IsString() documentNumber: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ci?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ipsNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ruc?: string;
  @ApiProperty() @IsDateString() birthDate: string;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @IsString() nationality?: string;
  @ApiPropertyOptional({ enum: MaritalStatus }) @IsOptional() @IsEnum(MaritalStatus) maritalStatus?: MaritalStatus;

  // Contact
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mobilePhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactRelation?: string;

  // Employment
  @ApiProperty() @IsDateString() hireDate: string;
  @ApiPropertyOptional({ enum: ContractType }) @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @ApiPropertyOptional() @IsOptional() @IsString() areaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() positionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() managerId?: string;

  // Payroll
  @ApiProperty() @IsInt() @Min(0) baseSalary: number;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;

  // User account
  @ApiPropertyOptional({ description: 'Email para crear usuario vinculado. Si se omite, el empleado no tendrá acceso al sistema.' })
  @IsOptional() @IsString() email?: string;
}
