import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import {
  PERMISSIONS,
  Permission,
} from '../../common/constants/permissions.constant';

export class AssignPermissionsDto {
  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  permissions: Permission[];
}
