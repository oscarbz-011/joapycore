'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { hrApi } from '../../../../../../lib/api/hr';
import { Button } from '@/components/ui/button';
import { EmployeeForm } from '../../_form';

export default function EditEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const back = () => router.push('/dashboard/hr');

  const { data: employee, isLoading } = useQuery({
    queryKey: ['hr-employee', id],
    queryFn: () => hrApi.getEmployee(id),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;
  }

  if (!employee) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground/60">Empleado no encontrado.</p>
        <button type="button" onClick={back} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver a empleados
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {employee.firstName} {employee.lastName}
          </h1>
          {employee.employeeCode && (
            <p className="mt-0.5 text-sm text-muted-foreground font-mono">{employee.employeeCode}</p>
          )}
        </div>
      </div>

      <EmployeeForm key={employee.id} initial={employee} onDone={back} />
    </div>
  );
}
