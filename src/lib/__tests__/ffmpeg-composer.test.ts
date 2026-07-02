import { describe, expect, it, vi } from "vitest";
import { FFmpegComposer } from "../ffmpeg-composer";
import fs from "fs/promises";
import path from "path";

describe("FFmpegComposer - Unit Tests", () => {
  describe("Subtitles ASS Generation", () => {
    it("should format timestamps and dialogue text correctly in the ASS file", async () => {
      const tempFile = path.join(process.cwd(), ".tmp", "test-subs.ass");
      await fs.mkdir(path.dirname(tempFile), { recursive: true });

      try {
        await FFmpegComposer.generateSubtitlesAssFile({
          hookText: "Hola MidiPlus",
          bodyText: "Este es un controlador sensitivo",
          ctaText: "Compralo hoy en cuotas",
          t1: 3.5,
          t2: 12.0,
          totalDuration: 15.0,
          outputPath: tempFile,
        });

        const fileContent = await fs.readFile(tempFile, "utf8");

        // Verificar encabezados del formato ASS
        expect(fileContent).toContain("[Script Info]");
        expect(fileContent).toContain("PlayResX: 720");
        expect(fileContent).toContain("PlayResY: 1280");
        expect(fileContent).toContain("[V4+ Styles]");
        
        // Verificar estilos de subtítulos estilo TikTok (semi-transparente)
        expect(fileContent).toContain("Style: Default");
        
        // Verificar los tiempos formateados
        // 0.0s -> 0:00:00.00
        expect(fileContent).toContain("Dialogue: 0,0:00:00.00,0:00:03.50,Default,,0,0,0,,Hola MidiPlus");
        // 3.5s -> 0:00:03.50
        expect(fileContent).toContain("Dialogue: 0,0:00:03.50,0:00:12.00,Default,,0,0,0,,Este es un controlador sensitivo");
        // 12.0s -> 0:00:12.00 a 15.00s -> 0:00:15.00
        expect(fileContent).toContain("Dialogue: 0,0:00:12.00,0:00:15.00,Default,,0,0,0,,Compralo hoy en cuotas");

      } finally {
        try {
          await fs.unlink(tempFile);
        } catch {}
      }
    });
  });

  describe("Timing & Word Count Calculation Simulation", () => {
    it("should compute proportional segments matching word lengths", () => {
      const hookText = "Hey"; // 1 palabra
      const bodyText = "This is a very cool test"; // 6 palabras
      const ctaText = "Bye now"; // 2 palabras
      const duration = 18.0; // 18 segundos

      const l1 = hookText.split(/\s+/).length || 1;
      const l2 = bodyText.split(/\s+/).length || 1;
      const l3 = ctaText.split(/\s+/).length || 1;
      const totalWords = l1 + l2 + l3; // 9 palabras

      const t1 = (l1 / totalWords) * duration; // (1/9) * 18 = 2
      const t2 = t1 + (l2 / totalWords) * duration; // 2 + (6/9)*18 = 2 + 12 = 14

      expect(l1).toBe(1);
      expect(l2).toBe(6);
      expect(l3).toBe(2);
      expect(totalWords).toBe(9);
      expect(t1).toBe(2.0);
      expect(t2).toBe(14.0);
    });
  });

  describe("Image Fallback Resolver Logic", () => {
    it("should resolve relative local image paths and download URLs", async () => {
      const tempPath = path.join(process.cwd(), ".tmp", "resolved-img.jpg");
      await fs.mkdir(path.dirname(tempPath), { recursive: true });

      // Mockear fs.copyFile para evitar lecturas de disco reales en test locales
      const copySpy = vi.spyOn(fs, "copyFile").mockImplementation(async () => {});

      try {
        // Test local path detection
        await FFmpegComposer.resolveImage("/uploads/test-image.jpg", tempPath);
        expect(copySpy).toHaveBeenCalledWith(
          expect.stringContaining(path.join("public", "uploads", "test-image.jpg")),
          tempPath
        );
      } finally {
        copySpy.mockRestore();
        try {
          await fs.unlink(tempPath);
        } catch {}
      }
    });
  });
});
