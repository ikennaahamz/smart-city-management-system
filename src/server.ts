import { loadEnv } from "./env";
import app from "./app";

loadEnv();

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Smart City Management System running at http://localhost:${port}`);
});
