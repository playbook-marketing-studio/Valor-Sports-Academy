import React, { useRef, useState } from 'react';
import { ScanLine, Loader2, Camera, Image as ImageIcon } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
// grams per unit
const units = { Grams: 1, 'OZ': 28.3495, 'FL OZ': 29.5735 };

export default function ScanFoodDialog({ onLogged }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(0);
  const [unit, setUnit] = useState('Grams');
  const [mealType, setMealType] = useState('Snack');
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const reset = () => {
    setFile(null); setPreview(null); setResult(null); setError(''); setAmount(0); setUnit('Grams');
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError('');
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = await base44.functions.invoke('scanNutritionLabel', { file_url });
      const data = res.data;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      setAmount(Math.round(data.serving_size_grams) || 0);
      setUnit('Grams');
    } catch (e) {
      setError(e.message || 'Failed to analyze label');
    } finally {
      setAnalyzing(false);
    }
  };

  const ratio = result && result.serving_size_grams > 0
    ? (amount * units[unit]) / result.serving_size_grams
    : 0;

  const scaled = result ? {
    calories: Math.round(result.calories * ratio),
    protein: Math.round(result.protein * ratio),
    carbs: Math.round(result.carbs * ratio),
    fats: Math.round(result.fats * ratio),
  } : null;

  const save = async () => {
    if (!result || !scaled) return;
    setSaving(true);
    try {
      await base44.entities.NutritionLog.create({
        meal_name: result.food_name,
        meal_type: mealType,
        calories: scaled.calories,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fats: scaled.fats,
        date: new Date().toISOString().slice(0, 10),
      });
      setOpen(false);
      reset();
      onLogged?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><ScanLine className="h-4 w-4" /> Scan Label</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Scan Nutrition Label</DialogTitle></DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              {preview ? (
                <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-lg" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Camera className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Snap the nutrition facts label</p>
                </div>
              )}
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
            <input ref={galleryRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            <div className="flex gap-2">
              <Button onClick={() => cameraRef.current?.click()} className="flex-1 gap-2"><Camera className="h-4 w-4" /> Take Photo</Button>
              <Button variant="outline" onClick={() => galleryRef.current?.click()} className="flex-1 gap-2"><ImageIcon className="h-4 w-4" /> Gallery</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={analyze} disabled={!file || analyzing} className="w-full gap-2">
              {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : 'Analyze Label'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="font-medium">{result.food_name}</p>
              <p className="text-xs text-muted-foreground">Per serving: {result.serving_size_text} ({result.serving_size_grams}g)</p>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                <div><p className="font-bold">{result.calories}</p><p className="text-muted-foreground">cal</p></div>
                <div><p className="font-bold">{result.protein}g</p><p className="text-muted-foreground">protein</p></div>
                <div><p className="font-bold">{result.carbs}g</p><p className="text-muted-foreground">carbs</p></div>
                <div><p className="font-bold">{result.fats}g</p><p className="text-muted-foreground">fats</p></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(units).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Meal Type</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mealTypes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Your portion · {amount} {unit}</p>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div><p className="font-bold text-primary">{scaled.calories}</p><p className="text-xs text-muted-foreground">cal</p></div>
                <div><p className="font-bold text-primary">{scaled.protein}g</p><p className="text-xs text-muted-foreground">protein</p></div>
                <div><p className="font-bold text-primary">{scaled.carbs}g</p><p className="text-xs text-muted-foreground">carbs</p></div>
                <div><p className="font-bold text-primary">{scaled.fats}g</p><p className="text-xs text-muted-foreground">fats</p></div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>Scan Another</Button>
              <Button onClick={save} disabled={saving || amount <= 0}>{saving ? 'Saving...' : 'Add to Log'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}