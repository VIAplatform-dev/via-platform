import { isCompsConfigured } from "../app/lib/comps";
console.log("SERPAPI_API_KEY set: ", Boolean(process.env.SERPAPI_API_KEY));
console.log("SERPAPI_ENABLED === 'true':", process.env.SERPAPI_ENABLED === "true");
console.log("raw SERPAPI_ENABLED length:", (process.env.SERPAPI_ENABLED || "").length);
console.log("--> isCompsConfigured():", isCompsConfigured());
