import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiEnv } from '../config/env';
import { CatalogAdminController } from './catalog-admin.controller';
import { PgCatalogLoader } from './catalog-loader';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { DatabaseExerciseCatalog } from './database-catalog';
import { EXERCISE_CATALOG } from './exercise-catalog';
import { ExercisesController } from './exercises.controller';

// The catalog: the snapshot behind EXERCISE_CATALOG, which modules that import
// ExercisesModule inject with @Inject(EXERCISE_CATALOG), the public routes and
// the admin write routes.
@Module({
  controllers: [ExercisesController, CatalogAdminController],
  providers: [
    PgCatalogLoader,
    CatalogRepository,
    CatalogService,
    {
      provide: EXERCISE_CATALOG,
      inject: [PgCatalogLoader, ConfigService],
      useFactory: (
        loader: PgCatalogLoader,
        config: ConfigService<ApiEnv, true>,
      ) =>
        new DatabaseExerciseCatalog(
          loader,
          {
            refreshMs:
              config.get('CATALOG_REFRESH_SECONDS', { infer: true }) * 1000,
            retryAfterFailureMs: 10_000,
            bootDeadlineMs: 10_000,
          },
          new Logger('ExerciseCatalog'),
        ),
    },
  ],
  exports: [EXERCISE_CATALOG],
})
export class ExercisesModule {}
