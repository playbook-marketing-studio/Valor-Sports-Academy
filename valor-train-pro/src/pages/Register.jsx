import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, User, Phone } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, [k]: v })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) return setError("Passwords do not match");
    if (form.password.length < 8) return setError("Use at least 8 characters");
    setLoading(true);
    try {
      await base44.auth.register({ email: form.email, password: form.password, full_name: form.full_name, phone: form.phone, role: "parent" });
      window.location.href = safeReturnTo();
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const field = (id, label, Icon, props) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <Input id={id} className="pl-10 h-12" {...props} />
      </div>
    </div>
  );

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Parents create the account; athletes under 18 train under it."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link>
          <br />
          Booking a first assessment?{" "}
          <Link to="/book" className="text-primary font-medium hover:underline">Start here</Link>
        </>
      }
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {field("name", "Your name", User, { value: form.full_name, onChange: set("full_name"), required: true, autoComplete: "name" })}
        {field("phone", "Phone", Phone, { type: "tel", value: form.phone, onChange: set("phone"), autoComplete: "tel" })}
        {field("email", "Email", Mail, { type: "email", value: form.email, onChange: set("email"), required: true, autoComplete: "email" })}
        {field("password", "Password", Lock, { type: "password", value: form.password, onChange: set("password"), required: true, autoComplete: "new-password" })}
        {field("confirm", "Confirm password", Lock, { type: "password", value: form.confirm, onChange: set("confirm"), required: true, autoComplete: "new-password" })}
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</>) : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
