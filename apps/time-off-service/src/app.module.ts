import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? './data/time_off.sqlite',
      enableWAL: true,
      prepareDatabase: (db: { pragma: (sql: string) => unknown }) => {
        db.pragma('busy_timeout = 5000');
      },
    }),
  ],
})
export class AppModule {}

