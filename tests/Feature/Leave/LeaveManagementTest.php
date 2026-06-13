<?php

namespace Tests\Feature\Leave;

use App\Exceptions\InsufficientLeaveBalanceException;
use App\Models\Employee;
use App\Models\LeaveHoliday;
use App\Models\LeaveType;
use App\Models\Role;
use App\Models\User;
use App\Services\Leave\EntitlementService;
use App\Services\Leave\LeaveBalanceService;
use App\Services\Leave\LeaveCalculatorService;
use App\Services\Leave\LeaveRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class LeaveManagementTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function annualType(): LeaveType
    {
        return LeaveType::create([
            'code' => 'ANNUAL', 'name' => 'Cuti Tahunan', 'unit' => 'day',
            'is_paid' => true, 'requires_balance' => true, 'requires_attachment' => false,
            'allow_half_day' => true, 'gender_constraint' => 'any', 'default_quota' => 12,
            'accrual_method' => 'tenure_based', 'min_notice_days' => 0, 'carry_over_max' => 6, 'is_active' => true,
        ]);
    }

    private function emp(array $attr = []): Employee
    {
        $this->seq++;

        return Employee::create(array_merge([
            'employee_code' => 'T'.$this->seq, 'first_name' => 'E'.$this->seq, 'full_name' => 'Emp '.$this->seq, 'is_active' => true,
        ], $attr));
    }

    public function test_calculator_excludes_weekend_and_holidays(): void
    {
        LeaveHoliday::create(['date' => '2026-08-17', 'name' => 'Merdeka', 'type' => 'national']);
        $calc = app(LeaveCalculatorService::class);

        $this->assertSame(4.0, $calc->effectiveDays('2026-08-14', '2026-08-20'));
        $this->assertSame(1.0, $calc->effectiveDays('2026-08-18', '2026-08-18'));
        $this->assertSame(0.5, $calc->effectiveDays('2026-08-18', '2026-08-18', 'first_half'));
        $this->assertSame(0.0, $calc->effectiveDays('2026-08-15', '2026-08-16'));
    }

    public function test_accrual_lump_sum_and_prorata(): void
    {
        $type = $this->annualType();
        $ent = app(EntitlementService::class);

        $senior = $this->emp(['hire_date' => '2022-01-01']);
        $this->assertSame(12.0, (float) $ent->accrue($senior, $type, 2026)->allotted);

        $newbie = $this->emp(['hire_date' => '2026-04-01']);
        $this->assertSame(9.0, (float) $ent->accrue($newbie, $type, 2026)->allotted);
    }

    public function test_balance_hold_commit_release_and_guard(): void
    {
        $type = $this->annualType();
        $e = $this->emp(['hire_date' => '2022-01-01']);
        app(EntitlementService::class)->accrue($e, $type, 2026);
        $bal = app(LeaveBalanceService::class);

        $bal->hold($e->id, $type->id, 2026, 3);
        $this->assertSame(9.0, $bal->available($e->id, $type->id, 2026));

        $bal->commit($e->id, $type->id, 2026, 3);
        $this->assertSame(9.0, $bal->available($e->id, $type->id, 2026));

        $bal->hold($e->id, $type->id, 2026, 2);
        $bal->release($e->id, $type->id, 2026, 2);
        $this->assertSame(9.0, $bal->available($e->id, $type->id, 2026));

        $this->expectException(InsufficientLeaveBalanceException::class);
        $bal->hold($e->id, $type->id, 2026, 99);
    }

    public function test_flow_supervisor_then_hr_commits_on_final_approval(): void
    {
        $type = $this->annualType();
        $sup = $this->emp();
        $r = $this->emp(['hire_date' => '2022-01-01', 'reports_to_employee_id' => $sup->id]);
        app(EntitlementService::class)->accrue($r, $type, 2026);
        $svc = app(LeaveRequestService::class);
        $bal = app(LeaveBalanceService::class);

        $req = $svc->submit($r, ['leave_type_id' => $type->id, 'start_date' => '2026-09-21', 'end_date' => '2026-09-22']);
        $this->assertSame('pending_supervisor', $req->status);
        $this->assertSame(['supervisor', 'hr'], $req->approvals->pluck('role')->all());
        $this->assertSame(10.0, $bal->available($r->id, $type->id, 2026));

        $svc->approve($req->fresh('approvals'), $sup);
        $this->assertSame('pending_hr', $req->fresh()->status);

        $svc->approve($req->fresh('approvals'), $sup);
        $this->assertSame('approved', $req->fresh()->status);
        $this->assertSame(10.0, $bal->available($r->id, $type->id, 2026));
    }

    public function test_manager_step_added_for_three_day_annual(): void
    {
        $type = $this->annualType();
        $mgr = $this->emp();
        $sup = $this->emp(['reports_to_employee_id' => $mgr->id]);
        $r = $this->emp(['hire_date' => '2022-01-01', 'reports_to_employee_id' => $sup->id]);
        app(EntitlementService::class)->accrue($r, $type, 2026);

        $req = app(LeaveRequestService::class)->submit($r, ['leave_type_id' => $type->id, 'start_date' => '2026-10-05', 'end_date' => '2026-10-08']);
        $this->assertSame(['supervisor', 'manager', 'hr'], $req->approvals->pluck('role')->all());
    }

    public function test_reject_releases_balance(): void
    {
        $type = $this->annualType();
        $sup = $this->emp();
        $r = $this->emp(['hire_date' => '2022-01-01', 'reports_to_employee_id' => $sup->id]);
        app(EntitlementService::class)->accrue($r, $type, 2026);
        $svc = app(LeaveRequestService::class);
        $bal = app(LeaveBalanceService::class);

        $req = $svc->submit($r, ['leave_type_id' => $type->id, 'start_date' => '2026-11-23', 'end_date' => '2026-11-24']);
        $this->assertSame(10.0, $bal->available($r->id, $type->id, 2026));

        $svc->reject($req->fresh('approvals'), $sup, 'tidak disetujui');
        $this->assertSame('rejected', $req->fresh()->status);
        $this->assertSame(12.0, $bal->available($r->id, $type->id, 2026));
    }

    public function test_overlapping_request_is_rejected(): void
    {
        $type = $this->annualType();
        $sup = $this->emp();
        $r = $this->emp(['hire_date' => '2022-01-01', 'reports_to_employee_id' => $sup->id]);
        app(EntitlementService::class)->accrue($r, $type, 2026);
        $svc = app(LeaveRequestService::class);

        $svc->submit($r, ['leave_type_id' => $type->id, 'start_date' => '2026-09-21', 'end_date' => '2026-09-23']);

        $this->expectException(RuntimeException::class);
        $svc->submit($r, ['leave_type_id' => $type->id, 'start_date' => '2026-09-22', 'end_date' => '2026-09-24']);
    }

    public function test_notifies_supervisor_on_submit_and_requester_on_decision(): void
    {
        $type = $this->annualType();
        $staff = Role::create(['name' => 'Staff', 'slug' => 'staff']);
        $sup = $this->emp();
        $supUser = User::create(['name' => 'Sup', 'email' => 's@x.com', 'password' => bcrypt('x'), 'role_id' => $staff->id]);
        $sup->update(['user_id' => $supUser->id]);
        $r = $this->emp(['hire_date' => '2022-01-01', 'reports_to_employee_id' => $sup->id]);
        $reqUser = User::create(['name' => 'Req', 'email' => 'r@x.com', 'password' => bcrypt('x'), 'role_id' => $staff->id]);
        $r->update(['user_id' => $reqUser->id]);
        app(EntitlementService::class)->accrue($r, $type, 2026);
        $svc = app(LeaveRequestService::class);

        $req = $svc->submit($r, ['leave_type_id' => $type->id, 'start_date' => '2026-09-21', 'end_date' => '2026-09-22']);
        $this->assertSame(1, $supUser->fresh()->unreadNotifications()->count());

        $svc->approve($req->fresh('approvals'), $sup);
        $svc->approve($req->fresh('approvals'), $sup);
        $this->assertSame(1, $reqUser->fresh()->unreadNotifications()->count());
    }
}
