const regex = /params\}: \{ params: Promise<\{ id: string \}> \}/;
console.log(regex.test(`  request: NextRequest,\n  { params }: { params: Promise<{ id: string }> }\n)`));
