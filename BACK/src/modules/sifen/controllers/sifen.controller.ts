import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { UpdateSifenSettingsDto } from '../dto/update-sifen-settings.dto';
import { SifenService } from '../services/sifen.service';
import { contentDisposition } from '../../../common/utils/download-headers.util';

const memStorage = memoryStorage();

@ApiTags('SIFEN')
@ApiBearerAuth()
@Controller('sifen')
export class SifenController {
  constructor(private readonly sifenService: SifenService) {}

  @Get('config')
  @Permissions('sifen:read')
  @ApiOperation({ summary: 'Obtener configuración SIFEN del tenant' })
  getConfig(@CurrentTenant() tenantId: string) {
    return this.sifenService.getConfig(tenantId);
  }

  @Patch('config/settings')
  @Permissions('sifen:manage')
  @ApiOperation({ summary: 'Actualizar ambiente SIFEN (TESTING / PRODUCTION)' })
  updateSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateSifenSettingsDto,
  ) {
    return this.sifenService.updateSettings(tenantId, dto);
  }

  @Post('config/certificate')
  @Permissions('sifen:manage')
  @UseInterceptors(FileInterceptor('file', { storage: memStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Cargar certificado de firma (.p12 / .pfx / .cer / .crt)',
  })
  uploadCertificate(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('password') password?: string,
  ) {
    return this.sifenService.uploadCertificate(tenantId, file, password);
  }

  @Delete('config/certificate')
  @Permissions('sifen:manage')
  @ApiOperation({ summary: 'Eliminar certificado de firma' })
  removeCertificate(@CurrentTenant() tenantId: string) {
    return this.sifenService.removeCertificate(tenantId);
  }

  @Post('config/ca-certificate')
  @Permissions('sifen:manage')
  @UseInterceptors(FileInterceptor('file', { storage: memStorage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Cargar certificado CA raíz SET Paraguay' })
  uploadCaCertificate(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.sifenService.uploadCaCertificate(tenantId, file);
  }

  @Delete('config/ca-certificate')
  @Permissions('sifen:manage')
  @ApiOperation({ summary: 'Eliminar certificado CA' })
  removeCaCertificate(@CurrentTenant() tenantId: string) {
    return this.sifenService.removeCaCertificate(tenantId);
  }

  @Get('config/certificate/download')
  @Permissions('sifen:manage')
  @ApiOperation({
    summary: 'Descargar copia del certificado de firma (backup)',
  })
  async downloadCertificate(
    @CurrentTenant() tenantId: string,
    @Res() res: Response,
  ) {
    const { filename, data, mimeType } =
      await this.sifenService.downloadCertificate(tenantId);
    res.setHeader(
      'Content-Disposition',
      contentDisposition('attachment', filename),
    );
    res.setHeader('Content-Type', mimeType);
    res.send(data);
  }

  @Post('config/test')
  @Permissions('sifen:manage')
  @ApiOperation({ summary: 'Probar conexión con el servicio web SET Paraguay' })
  testConnection(@CurrentTenant() tenantId: string) {
    return this.sifenService.testConnection(tenantId);
  }
}
