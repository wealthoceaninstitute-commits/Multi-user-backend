"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Signup() {
  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const router = useRouter();

  async function signup() {
    const res = await fetch("http://localhost:8000/signup",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({name,email,password})
    });

    const data = await res.json();

    if(data.status === "success"){
      alert("User Created");
      router.push("/login");
    } else {
      alert(data.message);
    }
  }

  return (
    <div style={{maxWidth:400,margin:"100px auto"}}>
      <h2>Create User</h2>
      <input onChange={e=>setName(e.target.value)} placeholder="Name"/><br/>
      <input onChange={e=>setEmail(e.target.value)} placeholder="Email"/><br/>
      <input type="password" onChange={e=>setPassword(e.target.value)} placeholder="Password"/><br/>
      <button onClick={signup}>Create</button>
    </div>
  )
}
