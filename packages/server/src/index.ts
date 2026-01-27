import dotenv from 'dotenv';
import express from 'express';
import router from './routes';

dotenv.config();

const app = express();

app.use(express.json());
app.use(router);

app.listen(process.env.PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`Server running on http://localhost:${process.env.PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50) + '\n');
});
