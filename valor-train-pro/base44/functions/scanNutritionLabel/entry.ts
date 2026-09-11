import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const file_url = body?.file_url;
    if (!file_url || typeof file_url !== 'string') {
      return Response.json({ error: 'file_url is required' }, { status: 400 });
    }

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt:
        "Analyze this nutrition facts label image. Extract: the food/product name, the serving size exactly as shown on the label (text), the serving size converted to grams (if the label shows fluid ounces use 1 fl oz = 29.57g; if ounces by weight use 1 oz = 28.35g; if cups or pieces, estimate the gram weight), and the calories, protein (g), carbs (g), and fats (g) PER SERVING as printed on the label. Return only the structured data.",
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          food_name: { type: "string" },
          serving_size_text: { type: "string" },
          serving_size_grams: { type: "number" },
          calories: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fats: { type: "number" }
        },
        required: ["food_name", "serving_size_grams", "calories", "protein", "carbs", "fats"]
      }
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}