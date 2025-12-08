import { GoogleGenAI } from "@google/genai";
import { JointState } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeDynamics = async (joints: JointState[]) => {
  try {
    // Format data for the prompt
    const dynamicsData = joints.map((j, i) => 
      `Joint ${i + 1}: Angle=${j.angle.toFixed(2)}rad, Vel=${j.velocity.toFixed(2)}rad/s, Torque=${j.torque.toFixed(2)}Nm`
    ).join('\n');

    const prompt = `
      You are an expert Robotics Engineer specializing in industrial robot dynamics (like ABB/KUKA).
      Analyze the following snapshot of a 6-DOF robot's state:
      
      ${dynamicsData}
      
      Please provide a brief assessment (max 3 sentences per point):
      1. **Stress Analysis**: Which joint is under the most load currently and why (gravity vs inertia)?
      2. **Efficiency**: Is this motion efficient?
      3. **Maintenance**: Based on high torque/velocity values, what components might need inspection?
      
      Output in plain text, keep it concise and professional.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text;

  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    return "Unable to analyze dynamics at this time. Please ensure API Key is configured.";
  }
};